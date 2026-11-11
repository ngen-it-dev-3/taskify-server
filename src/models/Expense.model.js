// models/Expense.model.js
const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema(
    {
        // ===================== WHO =====================
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        employeeName: { type: String, required: true },
        employeeEmail: { type: String, required: true },

        // ===================== WHAT =====================
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: { type: String, default: "", maxlength: 1000 },

        category: {
            type: String,
            required: true,
            enum: [
                "transport",      // CNG/Taxi
                "meals",          // Client Lunch
                "entertainment",  // Client entertainment
                "office_supply",  // Printing, stationery
                "accommodation",  // Hotel
                "personal",       // Sports club membership etc.
                "other",
            ],
        },

        // Amount in BDT (your UI shows ৳)
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            enum: ["BDT", "SAR", "USD", "AED", "INR", "EUR", "GBP"],
            default: "BDT",
            required: true,
            uppercase: true,
        },

        // For meals: number of guests
        guests: { type: Number, default: 0 },

        // ===================== WHEN =====================
        expenseDate: { type: Date, required: true },

        // ===================== WHERE (GPS cross-reference) =====================
        location: {
            // Where the employee was when submitting
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            label: { type: String, default: "" }, // "DPDC Head Office"
        },

        // Optional link to a task (for task-attached expense)
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
        },

        // ===================== RECEIPT =====================
        receiptUrl: { type: String, default: "" },       // uploaded image URL
        receiptThumbnailUrl: { type: String, default: "" },

        // ===================== APPROVAL WORKFLOW =====================
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "paid"],
            default: "pending",
            index: true,
        },

        // Approver
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        approvedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: "" },

        // Whether the amount has been pushed to payroll
        payrollSynced: { type: Boolean, default: false },
        payrollSyncedAt: { type: Date, default: null },

        // ===================== GPS VERIFICATION =====================
        gpsVerified: { type: Boolean, default: false },
        gpsVerification: {
            verified: { type: Boolean, default: false },
            matchedLocation: { type: String, default: "" }, // "DPDC"
            note: { type: String, default: "" },             // "GPS verified: Nasrin was at DPDC..."
            verifiedAt: { type: Date, default: null },
        },

        // ===================== AUDIT =====================
        submittedAt: { type: Date, default: Date.now, index: true },
        updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// ===================== INDEXES =====================
ExpenseSchema.index({ employeeId: 1, expenseDate: -1 });
ExpenseSchema.index({ status: 1, submittedAt: -1 });
ExpenseSchema.index({ category: 1, status: 1 });

// ===================== VIRTUALS =====================
ExpenseSchema.virtual("isRecent").get(function () {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(this.expenseDate).getTime() < sevenDays;
});

// ===================== STATIC: Monthly summary for an employee =====================
ExpenseSchema.statics.monthlySummary = async function (employeeId, year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const result = await this.aggregate([
        {
            $match: {
                employeeId: new mongoose.Types.ObjectId(employeeId),
                expenseDate: { $gte: start, $lte: end },
            },
        },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                total: { $sum: "$amount" },
            },
        },
    ]);

    const summary = {
        pending: { count: 0, total: 0 },
        approved: { count: 0, total: 0 },
        rejected: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
    };

    result.forEach((r) => {
        summary[r._id] = { count: r.count, total: r.total };
    });

    return summary;
};

ExpenseSchema.set("toJSON", { virtuals: true });
ExpenseSchema.set("toObject", { virtuals: true });

module.exports =
    mongoose.models.Expense || mongoose.model("Expense", ExpenseSchema);