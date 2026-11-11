// models/Backup.model.js - Update the schema
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const backupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ["full", "partial", "schema"],
        default: "full",
    },
    size: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed", "failed"],
        default: "pending",
    },
    filePath: {
        type: String,
        required: true,
    },
    fileName: {
        type: String,
        required: true,
    },
    collections: [String],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    completedAt: Date,
    metadata: {
        database: { type: String, default: "mongodb" },
        version: { type: String, default: "1.0" },
        compression: { type: String, default: "json" },
        duration: { type: Number, default: 0 },
    },
}, {
    timestamps: true,
});

// Static methods
backupSchema.statics.getStats = async function() {
    const [totalBackups, totalSize, lastBackup, statusCounts, typeCounts] = await Promise.all([
        this.countDocuments({ status: "completed" }),
        this.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: null, total: { $sum: "$size" } } },
        ]),
        this.findOne({ status: "completed" })
            .sort({ createdAt: -1 })
            .select("createdAt"),
        this.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        this.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),
    ]);

    const total = totalBackups || 0;
    const totalSizeBytes = totalSize[0]?.total || 0;

    const statusMap = {};
    statusCounts.forEach((s) => {
        statusMap[s._id] = s.count;
    });

    const typeMap = {};
    typeCounts.forEach((t) => {
        typeMap[t._id] = t.count;
    });

    const successCount = statusMap.completed || 0;
    const failedCount = statusMap.failed || 0;
    const totalCount = successCount + failedCount;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

    return {
        totalBackups: total,
        totalSize: totalSizeBytes,
        lastBackup: lastBackup?.createdAt || null,
        successRate,
        backupsByStatus: statusMap,
        backupsByType: typeMap,
    };
};

// Schedule methods
const scheduleSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ["daily", "weekly", "monthly"], default: "daily" },
    time: { type: String, default: "02:00" },
    keepLast: { type: Number, default: 7 },
}, { timestamps: true });

const Schedule = mongoose.model("BackupSchedule", scheduleSchema);

backupSchema.statics.getSchedule = async function() {
    let schedule = await Schedule.findOne();
    if (!schedule) {
        schedule = await Schedule.create({});
    }
    return schedule;
};

backupSchema.statics.updateSchedule = async function(data) {
    let schedule = await Schedule.findOne();
    if (!schedule) {
        schedule = new Schedule(data);
    } else {
        Object.assign(schedule, data);
    }
    await schedule.save();
    return schedule;
};

const Backup = mongoose.model("Backup", backupSchema);

module.exports = { Backup };