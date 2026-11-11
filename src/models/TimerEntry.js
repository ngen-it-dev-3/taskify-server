// models/TimerEntry.js
const mongoose = require("mongoose");

const TimerEntrySchema = new mongoose.Schema(
    {
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            required: true,
        },
        taskTitle: {
            type: String,
            required: true,
        },
        taskStatus: {
            type: String,
            enum: ["pending", "in_progress", "submitted", "completed", "overdue", "rejected"],
            default: "in_progress",
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        userName: {
            type: String,
            required: true,
        },
        userEmail: {
            type: String,
            required: true,
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endTime: {
            type: Date,
            default: null,
        },
        duration: {
            type: Number,
            default: 0,
        },
        description: {
            type: String,
            default: "",
            maxlength: 500,
        },
        isRunning: {
            type: Boolean,
            default: false,
        },
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
        },
        projectName: {
            type: String,
        },
        isBillable: {
            type: Boolean,
            default: true,
        },
        hourlyRate: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for better query performance
TimerEntrySchema.index({ userId: 1, startTime: -1 });
TimerEntrySchema.index({ taskId: 1, isRunning: 1 });
TimerEntrySchema.index({ startTime: -1 });
TimerEntrySchema.index({ userId: 1, isRunning: 1 });

// Virtual for cost calculation
TimerEntrySchema.virtual("cost").get(function () {
    if (!this.isBillable || !this.hourlyRate) return 0;
    const hours = this.duration / 3600;
    return Math.round(hours * this.hourlyRate * 100) / 100;
});

// Instance method to stop timer
TimerEntrySchema.methods.stopTimer = async function () {
    if (!this.isRunning) return this;

    this.endTime = new Date();
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);
    this.duration += Math.floor((end - start) / 1000);
    this.isRunning = false;
    await this.save();
    return this;
};

// Instance method to calculate elapsed time
TimerEntrySchema.methods.getElapsedTime = function () {
    if (!this.isRunning) return this.duration;
    const start = new Date(this.startTime);
    const now = new Date();
    return this.duration + Math.floor((now - start) / 1000);
};

// Static method to get user stats
TimerEntrySchema.statics.getUserStats = async function (userId, startDate, endDate) {
    const match = {
        userId: userId,
        ...(startDate && { startTime: { $gte: startDate } }),
        ...(endDate && { startTime: { $lte: endDate } }),
    };

    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalDuration: { $sum: "$duration" },
                totalTasks: { $addToSet: "$taskId" },
                averageDuration: { $avg: "$duration" },
                totalBillable: {
                    $sum: { $cond: [{ $eq: ["$isBillable", true] }, "$duration", 0] },
                },
                totalCost: {
                    $sum: {
                        $cond: [
                            { $eq: ["$isBillable", true] },
                            { $multiply: [{ $divide: ["$duration", 3600] }, "$hourlyRate"] },
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    return stats[0] || {
        totalDuration: 0,
        totalTasks: [],
        averageDuration: 0,
        totalBillable: 0,
        totalCost: 0,
    };
};

module.exports = mongoose.models.TimerEntry || mongoose.model("TimerEntry", TimerEntrySchema);