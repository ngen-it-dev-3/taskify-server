// routes/notification.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  getUserNotifications,
  getNotificationStats,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  bulkAction,
  getUnreadCount,
} = require("../controllers/notification.controller");

const router = express.Router();

router.use(authenticate);

router.get("/", getUserNotifications);
router.get("/stats", getNotificationStats);
router.get("/unread-count", getUnreadCount);

router.patch("/read-all", markAllAsRead);
router.delete("/read", deleteAllRead);
router.post("/bulk", bulkAction);

router.patch("/:id/read", markAsRead);
router.patch("/:id/unread", markAsUnread);
router.delete("/:id", deleteNotification);

module.exports = router;