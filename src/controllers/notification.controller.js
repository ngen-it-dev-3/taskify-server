// controllers/notification.controller.js
const { Notification } = require("../models/Notification.model");
const { User } = require("../models/User.model");

// ============================================================
// GET USER NOTIFICATIONS
// ============================================================
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 20,
      isRead,
      category,
      search,
      sort = "desc",
    } = req.query;

    // Build query
    let query = { userId };

    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = sort === "desc" ? -1 : 1;

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET NOTIFICATION STATS
// ============================================================
const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get total counts
    const [total, unread, read] = await Promise.all([
      Notification.countDocuments({ userId }),
      Notification.countDocuments({ userId, isRead: false }),
      Notification.countDocuments({ userId, isRead: true }),
    ]);

    // Get counts by category
    const categories = ["task", "comment", "approval", "system", "reminder", "channel", "mention"];
    const byCategory = {};
    for (const category of categories) {
      byCategory[category] = await Notification.countDocuments({
        userId,
        category,
      });
    }

    // Get counts by type
    const types = ["info", "success", "warning", "error", "mention", "channel_invite"];
    const byType = {};
    for (const type of types) {
      byType[type] = await Notification.countDocuments({ userId, type });
    }

    // Get last 7 days stats
    const lastWeek = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await Notification.countDocuments({
        userId,
        createdAt: { $gte: date, $lt: nextDate },
      });

      lastWeek.push({
        date: date.toISOString().split("T")[0],
        count,
      });
    }

    res.json({
      success: true,
      data: {
        total,
        unread,
        read,
        byCategory,
        byType,
        lastWeek,
      },
    });
  } catch (error) {
    console.error("Get notification stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// MARK AS READ
// ============================================================
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// MARK AS UNREAD
// ============================================================
const markAsUnread = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isRead: false }, $unset: { readAt: 1 } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification marked as unread",
      data: notification,
    });
  } catch (error) {
    console.error("Mark as unread error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// MARK ALL AS READ
// ============================================================
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// DELETE NOTIFICATION
// ============================================================
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const result = await Notification.findOneAndDelete({ _id: id, userId });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// DELETE ALL READ NOTIFICATIONS
// ============================================================
const deleteAllRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.deleteMany({ userId, isRead: true });

    res.json({
      success: true,
      message: `${result.deletedCount} read notifications deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Delete all read error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// BULK ACTION
// ============================================================
const bulkAction = async (req, res) => {
  try {
    const { action, ids } = req.body;
    const userId = req.user._id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No notification IDs provided",
      });
    }

    let result;
    if (action === "read") {
      result = await Notification.updateMany(
        { _id: { $in: ids }, userId },
        { $set: { isRead: true, readAt: new Date() } },
      );
    } else if (action === "delete") {
      result = await Notification.deleteMany({ _id: { $in: ids }, userId });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    res.json({
      success: true,
      message: `${action === "read" ? "Marked as read" : "Deleted"} ${result.modifiedCount || result.deletedCount} notification(s)`,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// GET UNREAD COUNT
// ============================================================
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ userId, isRead: false });

    res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// CREATE NOTIFICATION (Helper)
// ============================================================
const createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    return { success: true, data: notification };
  } catch (error) {
    console.error("Create notification error:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  getUserNotifications,
  getNotificationStats,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  bulkAction,
  getUnreadCount,
  createNotification,
};