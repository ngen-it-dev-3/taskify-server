// controllers/timer.controller.js
const mongoose = require("mongoose");

// ✅ FIXED: Import models correctly
const TimerEntry = require("../models/TimerEntry");
const { Task } = require("../models/Task.model");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Calculate elapsed time for a running timer
const getElapsedTime = (entry) => {
    if (!entry.isRunning) return entry.duration;
    const start = new Date(entry.startTime);
    const now = new Date();
    return entry.duration + Math.floor((now - start) / 1000);
};

// Format duration in seconds to human readable string
const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
};

// Format duration short
const formatDurationShort = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
};

// Get daily activity for a user
const getDailyActivity = async (userId, days = 7) => {
    const activity = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const entries = await TimerEntry.find({
            userId,
            startTime: { $gte: dayStart, $lte: dayEnd },
        });

        const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);
        activity.push({
            date: date.toISOString().split("T")[0],
            duration: totalDuration,
            entries: entries.length,
        });
    }

    return activity;
};

// ============================================================
// GET TIMER ENTRIES
// ============================================================
const getTimerEntries = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            taskId,
            startDate,
            endDate,
            projectId,
            isBillable,
        } = req.query;

        const query = { userId: req.user._id };

        // Status filter
        if (status === "running") {
            query.isRunning = true;
        } else if (status === "completed") {
            query.isRunning = false;
        }

        // Additional filters
        if (taskId) query.taskId = taskId;
        if (projectId) query.projectId = projectId;
        if (isBillable !== undefined) query.isBillable = isBillable === "true";

        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate);
            if (endDate) query.startTime.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [entries, total] = await Promise.all([
            TimerEntry.find(query)
                .sort({ startTime: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            TimerEntry.countDocuments(query),
        ]);

        // Calculate elapsed time for running entries
        const entriesWithElapsed = entries.map((entry) => ({
            ...entry,
            elapsedTime: entry.isRunning ? getElapsedTime(entry) : entry.duration,
            displayTime: formatDuration(entry.isRunning ? getElapsedTime(entry) : entry.duration),
        }));

        console.log(`📊 Found ${entries.length} timer entries for user ${req.user._id}`);

        res.status(200).json({
            success: true,
            data: entriesWithElapsed,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("❌ Error fetching timer entries:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch timer entries",
            error: error.message,
        });
    }
};

// ============================================================
// GET TIMER STATISTICS
// ============================================================
const getTimerStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        // Date ranges
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
        weekEnd.setHours(23, 59, 59, 999);

        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0);
        monthEnd.setHours(23, 59, 59, 999);

        // Get all entries for stats
        const [
            todayEntries,
            weekEntries,
            monthEntries,
            allEntries,
            runningEntries,
        ] = await Promise.all([
            TimerEntry.find({
                userId,
                startTime: { $gte: todayStart, $lte: todayEnd },
            }),
            TimerEntry.find({
                userId,
                startTime: { $gte: weekStart, $lte: weekEnd },
            }),
            TimerEntry.find({
                userId,
                startTime: { $gte: monthStart, $lte: monthEnd },
            }),
            TimerEntry.find({ userId }),
            TimerEntry.find({ userId, isRunning: true }),
        ]);

        // Calculate totals
        const totalTimeToday = todayEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const totalTimeThisWeek = weekEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const totalTimeThisMonth = monthEntries.reduce((sum, entry) => sum + entry.duration, 0);
        const totalTimeAll = allEntries.reduce((sum, entry) => sum + entry.duration, 0);

        // Calculate average daily time (last 30 days)
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const last30DaysEntries = await TimerEntry.find({
            userId,
            startTime: { $gte: thirtyDaysAgo, $lte: todayEnd },
        });

        const uniqueDays = new Set();
        last30DaysEntries.forEach((entry) => {
            uniqueDays.add(entry.startTime.toDateString());
        });
        const averageDailyTime = uniqueDays.size > 0
            ? Math.round(last30DaysEntries.reduce((sum, entry) => sum + entry.duration, 0) / uniqueDays.size)
            : 0;

        // Count unique tasks tracked
        const uniqueTasks = new Set();
        allEntries.forEach((entry) => {
            if (entry.taskId) {
                uniqueTasks.add(entry.taskId.toString());
            }
        });

        // Calculate current streak (consecutive days with activity)
        let streak = 0;
        let checkDate = new Date(now);
        checkDate.setHours(0, 0, 0, 0);

        while (true) {
            const dayStart = new Date(checkDate);
            const dayEnd = new Date(checkDate);
            dayEnd.setHours(23, 59, 59, 999);

            const dayEntries = await TimerEntry.findOne({
                userId,
                startTime: { $gte: dayStart, $lte: dayEnd },
            });

            if (dayEntries) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Get active running entry
        const activeEntry = runningEntries[0] || null;
        let activeTask = null;
        if (activeEntry) {
            try {
                activeTask = await Task.findById(activeEntry.taskId)
                    .select("title status assignedTo")
                    .populate("assignedTo", "fullName email")
                    .lean();
            } catch (err) {
                console.warn("Could not fetch task details:", err.message);
            }
        }

        console.log(`📊 Stats calculated for user ${userId}`);

        res.status(200).json({
            success: true,
            data: {
                totalTimeToday,
                totalTimeThisWeek,
                totalTimeThisMonth,
                totalTimeAll,
                averageDailyTime,
                tasksTracked: uniqueTasks.size,
                currentStreak: streak,
                activeTimer: activeEntry
                    ? {
                        ...activeEntry.toObject(),
                        elapsedTime: getElapsedTime(activeEntry),
                        displayTime: formatDuration(getElapsedTime(activeEntry)),
                        task: activeTask,
                    }
                    : null,
                dailyActivity: await getDailyActivity(userId, 7),
            },
        });
    } catch (error) {
        console.error("❌ Error fetching timer stats:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch timer statistics",
            error: error.message,
        });
    }
};

// ============================================================
// CREATE MANUAL TIMER ENTRY
// ============================================================
const createManualEntry = async (req, res) => {
    try {
        const { taskId, description, duration, startTime, isBillable, hourlyRate } = req.body;
        const userId = req.user._id;

        console.log("📝 createManualEntry called with:", {
            taskId,
            description,
            duration,
            userId,
            userEmail: req.user.email
        });

        // Validate required fields
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Task ID is required",
            });
        }

        if (!duration || duration <= 0) {
            return res.status(400).json({
                success: false,
                message: "Duration must be greater than 0",
            });
        }

        // Find the task
        const task = await Task.findById(taskId)
            .populate("assignedTo", "fullName email")
            .lean();

        if (!task) {
            console.error("❌ Task not found for ID:", taskId);
            return res.status(404).json({
                success: false,
                message: "Task not found",
                taskId: taskId,
            });
        }

        console.log("📋 Task found:", {
            id: task._id,
            title: task.title,
            assignedTo: task.assignedTo?._id,
        });

        // Check if user has permission
        const isAssignee = task.assignedTo && task.assignedTo._id.toString() === userId.toString();
        const isAdmin = ["admin", "super_admin", "hr_manager"].includes(req.user.role);
        const isCreator = task.assignedBy && task.assignedBy.toString() === userId.toString();

        console.log("🔍 Permission check:", {
            isAssignee,
            isAdmin,
            isCreator,
            userId,
            taskAssignedTo: task.assignedTo?._id,
        });

        if (!isAssignee && !isAdmin && !isCreator) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to log time for this task",
            });
        }

        // Get user name
        const userName = req.user.fullName || req.user.username || req.user.email || "User";

        // Create timer entry
        const startDateTime = startTime ? new Date(startTime) : new Date();
        const endDateTime = new Date(startDateTime.getTime() + duration * 1000);

        // ✅ FIXED: Use TimerEntry directly (not destructured)
        const timerEntryData = {
            taskId: task._id,
            taskTitle: task.title,
            taskStatus: task.status || "in_progress",
            userId: userId,
            userName: userName,
            userEmail: req.user.email || "user@example.com",
            startTime: startDateTime,
            endTime: endDateTime,
            duration: duration,
            description: description || `Manual entry: ${task.title}`,
            isRunning: false,
            projectId: task.projectId || null,
            projectName: task.project || null,
            isBillable: isBillable !== undefined ? isBillable : true,
            hourlyRate: hourlyRate || req.user.hourlyRate || 0,
        };

        // ✅ FIXED: Create new TimerEntry instance
        const timerEntry = new TimerEntry(timerEntryData);
        await timerEntry.save();
        console.log("✅ Timer entry created:", timerEntry._id);

        // Update task's actualMinutes
        try {
            const currentMinutes = task.actualMinutes || 0;
            const newMinutes = currentMinutes + (duration / 60);
            const roundedMinutes = Math.round(newMinutes * 100) / 100;

            await Task.findByIdAndUpdate(task._id, {
                actualMinutes: roundedMinutes,
                $inc: { elapsedTime: duration },
            });
            console.log(`✅ Task ${task._id} updated: +${duration}s (${duration / 60}m) total: ${roundedMinutes}m`);
        } catch (err) {
            console.warn("⚠️ Could not update task:", err.message);
        }

        res.status(201).json({
            success: true,
            message: "Manual timer entry created successfully",
            data: timerEntry,
        });
    } catch (error) {
        console.error("❌ Error creating manual entry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create manual entry: " + error.message,
        });
    }
};

// ============================================================
// UPDATE TIMER ENTRY
// ============================================================
const updateTimerEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const { description, duration, isBillable, hourlyRate } = req.body;
        const userId = req.user._id;

        const timerEntry = await TimerEntry.findOne({
            _id: entryId,
            userId: userId,
        });

        if (!timerEntry) {
            return res.status(404).json({
                success: false,
                message: "Timer entry not found",
            });
        }

        if (timerEntry.isRunning) {
            return res.status(400).json({
                success: false,
                message: "Cannot update a running timer. Please stop it first.",
            });
        }

        // Update fields
        if (description !== undefined) timerEntry.description = description;
        if (duration !== undefined && duration > 0) {
            timerEntry.duration = duration;
            if (timerEntry.startTime) {
                timerEntry.endTime = new Date(new Date(timerEntry.startTime).getTime() + duration * 1000);
            }
        }
        if (isBillable !== undefined) timerEntry.isBillable = isBillable;
        if (hourlyRate !== undefined) timerEntry.hourlyRate = hourlyRate;

        timerEntry.updatedAt = new Date();
        await timerEntry.save();

        console.log(`✅ Timer entry ${entryId} updated`);

        res.status(200).json({
            success: true,
            message: "Timer entry updated successfully",
            data: timerEntry,
        });
    } catch (error) {
        console.error("❌ Error updating timer entry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update timer entry",
            error: error.message,
        });
    }
};

// ============================================================
// DELETE TIMER ENTRY
// ============================================================
const deleteTimerEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const userId = req.user._id;

        const timerEntry = await TimerEntry.findOne({
            _id: entryId,
            userId: userId,
        });

        if (!timerEntry) {
            return res.status(404).json({
                success: false,
                message: "Timer entry not found",
            });
        }

        if (timerEntry.isRunning) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete a running timer. Please stop it first.",
            });
        }

        await timerEntry.deleteOne();

        console.log(`✅ Timer entry ${entryId} deleted`);

        res.status(200).json({
            success: true,
            message: "Timer entry deleted successfully",
        });
    } catch (error) {
        console.error("❌ Error deleting timer entry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete timer entry",
            error: error.message,
        });
    }
};

// ============================================================
// GET TIMER REPORT
// ============================================================
const getTimerReport = async (req, res) => {
    try {
        const { startDate, endDate, userId, projectId, taskId } = req.query;
        const currentUser = req.user;

        // Build query
        const query = {};
        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate);
            if (endDate) query.startTime.$lte = new Date(endDate);
        }
        if (userId) query.userId = userId;
        if (projectId) query.projectId = projectId;
        if (taskId) query.taskId = taskId;

        // Check permissions
        if (userId && userId !== currentUser._id.toString()) {
            const allowedRoles = ["admin", "super_admin", "hr_manager", "dept_manager"];
            if (!allowedRoles.includes(currentUser.role)) {
                return res.status(403).json({
                    success: false,
                    message: "You don't have permission to view other users' reports",
                });
            }
        }

        const entries = await TimerEntry.find(query)
            .sort({ startTime: -1 })
            .lean();

        // Calculate summary
        const summary = {
            totalDuration: entries.reduce((sum, entry) => sum + entry.duration, 0),
            totalEntries: entries.length,
            totalBillableDuration: entries
                .filter((e) => e.isBillable)
                .reduce((sum, entry) => sum + entry.duration, 0),
            totalCost: entries
                .filter((e) => e.isBillable)
                .reduce((sum, entry) => sum + (entry.duration / 3600) * (entry.hourlyRate || 0), 0),
            tasks: {},
            users: {},
            projects: {},
        };

        // Group by task
        entries.forEach((entry) => {
            const taskId = entry.taskId.toString();
            if (!summary.tasks[taskId]) {
                summary.tasks[taskId] = {
                    title: entry.taskTitle || "Unknown Task",
                    duration: 0,
                    entries: 0,
                };
            }
            summary.tasks[taskId].duration += entry.duration;
            summary.tasks[taskId].entries += 1;
        });

        // Group by user
        entries.forEach((entry) => {
            const userId = entry.userId.toString();
            if (!summary.users[userId]) {
                summary.users[userId] = {
                    name: entry.userName || "Unknown User",
                    email: entry.userEmail || "",
                    duration: 0,
                    entries: 0,
                };
            }
            summary.users[userId].duration += entry.duration;
            summary.users[userId].entries += 1;
        });

        // Group by project
        entries.forEach((entry) => {
            if (entry.projectId) {
                const projectId = entry.projectId.toString();
                if (!summary.projects[projectId]) {
                    summary.projects[projectId] = {
                        name: entry.projectName || "Unknown Project",
                        duration: 0,
                        entries: 0,
                    };
                }
                summary.projects[projectId].duration += entry.duration;
                summary.projects[projectId].entries += 1;
            }
        });

        res.status(200).json({
            success: true,
            data: {
                entries,
                summary,
            },
        });
    } catch (error) {
        console.error("❌ Error generating timer report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate timer report",
            error: error.message,
        });
    }
};

// ============================================================
// EXPORT ALL CONTROLLERS
// ============================================================
module.exports = {
    getTimerEntries,
    getTimerStats,
    createManualEntry,
    updateTimerEntry,
    deleteTimerEntry,
    getTimerReport,
};