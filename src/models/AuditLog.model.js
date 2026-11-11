// models/AuditLog.model.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
            enum: [
                "login",
                "logout",
                "create",
                "update",
                "delete",
                "view",
                "export",
                "import",
                "share",
                "copy",
                "move",
                "archive",
                "restore",
                "approve",
                "reject",
                "lock",
                "unlock",
                "assign",
                "unassign",
                "invite",
                "remove",
                "enable",
                "disable",
                "reset",
                "change",
                "admin_create_user",
                "register",
                "cancel_subscription",
                "create_plan",
                "update_plan",
                "delete_plan",
                "toggle_plan",
                "set_plan_order",
            ],
        },
        resource: {
            type: String,
            required: true,
            enum: [
                "user",
                "users",
                "role",
                "roles",
                "permission",
                "permissions",
                "task",
                "tasks",
                "project",
                "projects",
                "team",
                "teams",
                "setting",
                "settings",
                "audit",
                "logs",
                "api",
                "keys",
                "report",
                "reports",
                "notification",
                "notifications",
                "message",
                "messages",
                "department",
                "departments",
                "pricing_plan", // ✅ ADDED
                "billing",
                "invoice",
                "subscription",
                "transaction",
                "payment_method",
            ],
        },
        resourceId: {
            type: String,
            default: null,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // ✅ Changed to false for system actions
        },
        user: {
            id: {
                type: String,
                default: null,
            },
            name: {
                type: String,
                default: "System",
            },
            email: {
                type: String,
                default: "system@example.com",
            },
            role: {
                type: String,
                default: "system",
            },
        },
        ip: {
            type: String,
            required: false,
            default: "0.0.0.0",
        },
        userAgent: {
            type: String,
            required: false,
            default: "Unknown",
        },
        device: {
            type: String,
            default: "Unknown",
        },
        location: {
            type: String,
            default: "Unknown",
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        status: {
            type: String,
            enum: ["success", "failed", "warning", "info"],
            default: "success",
        },
        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "low",
        },
        metadata: {
            browser: { type: String, default: "Unknown" },
            os: { type: String, default: "Unknown" },
            platform: { type: String, default: "Unknown" },
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for faster queries
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

// Static method to create audit log
auditLogSchema.statics.createLog = async function (data) {
    try {
        const log = new this(data);
        await log.save();
        return log;
    } catch (error) {
        console.error("Failed to create audit log:", error);
        return null;
    }
};

// Static method to get stats
auditLogSchema.statics.getStats = async function (filters = {}) {
    const match = { ...filters };

    const [
        total,
        today,
        thisWeek,
        thisMonth,
        success,
        failed,
        byAction,
        bySeverity,
        byResource,
    ] = await Promise.all([
        this.countDocuments(match),
        this.countDocuments({
            ...match,
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
        this.countDocuments({
            ...match,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        this.countDocuments({
            ...match,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),
        this.countDocuments({ ...match, status: "success" }),
        this.countDocuments({ ...match, status: "failed" }),
        this.aggregate([
            { $match: match },
            { $group: { _id: "$action", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]),
        this.aggregate([
            { $match: match },
            { $group: { _id: "$severity", count: { $sum: 1 } } },
        ]),
        this.aggregate([
            { $match: match },
            { $group: { _id: "$resource", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]),
    ]);

    const byActionMap = {};
    byAction.forEach((item) => {
        byActionMap[item._id] = item.count;
    });

    const bySeverityMap = {};
    bySeverity.forEach((item) => {
        bySeverityMap[item._id] = item.count;
    });

    const byResourceMap = {};
    byResource.forEach((item) => {
        byResourceMap[item._id] = item.count;
    });

    return {
        total,
        today,
        thisWeek,
        thisMonth,
        success,
        failed,
        byAction: byActionMap,
        bySeverity: bySeverityMap,
        byResource: byResourceMap,
    };
};

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = { AuditLog };