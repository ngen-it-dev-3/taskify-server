// routes/message.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { upload } = require("../middleware/upload.middleware");
const {
  sendMessage,
  getChannelMessages,
  editMessage,
  deleteMessage,
  addReaction,
  markMessagesAsRead,
  pinMessage,
  getPinnedMessages,
  getMessageById,
  removeReaction,
} = require("../controllers/message.controller");

const router = express.Router();

// ============================================================
// All routes require authentication
// ============================================================
router.use(authenticate);

// ============================================================
// GET ROUTES
// ============================================================

// Get a single message by ID
router.get("/:id", getMessageById);

// Get channel messages
router.get("/channel/:channelId", getChannelMessages);

// Get pinned messages in channel
router.get("/channel/:channelId/pinned", getPinnedMessages);

// ============================================================
// POST ROUTES
// ============================================================

// ✅ Send a message with optional file uploads (max 10 files, 50MB each)
router.post(
  "/channel/:channelId",
  upload.array("files", 10),
  sendMessage
);

// Mark messages as read in channel
router.post("/channel/:channelId/read", markMessagesAsRead);

// Add reaction to message (uses :id)
router.post("/:id/reaction", addReaction);

// Pin/Unpin a message (uses :id)
router.post("/:id/pin", pinMessage);

// ============================================================
// PUT ROUTES
// ============================================================

// Edit a message
router.put("/:id", editMessage);

// ============================================================
// DELETE ROUTES
// ============================================================

// Delete a message
router.delete("/:id", deleteMessage);

// Remove reaction from message (uses :messageId)
router.delete("/:messageId/reaction", removeReaction);

module.exports = router;