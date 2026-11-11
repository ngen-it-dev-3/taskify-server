// routes/channel.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  createChannel,
  getUserChannels,
  getChannelById,
  updateChannel,
  deleteChannel,
  joinChannel,
  leaveChannel,
  inviteUsers,
  removeUser,
  getChannelMembers,
  getPinnedFiles,
  getLinkedTasks,
  addPinnedFile,
  removePinnedFile,
  linkTask,
  unlinkTask,
  makeAdmin, // ✅ Add this
  getChannelMembersWithRoles
} = require("../controllers/channel.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// CHANNEL CRUD
// ============================================================
router.get("/", getUserChannels);
router.post("/", createChannel);
router.get("/:id", getChannelById);
router.put("/:id", updateChannel);
router.delete("/:id", deleteChannel);

// ============================================================
// CHANNEL MEMBERSHIP
// ============================================================
router.post("/:id/join", joinChannel);
router.post("/:id/leave", leaveChannel);
router.get("/:id/members", getChannelMembers);

// ============================================================
// CHANNEL MEMBER MANAGEMENT
// ============================================================
router.post("/:id/invite", inviteUsers);
router.delete("/:id/members/:userId", removeUser);

// ============================================================
// PINNED FILES
// ============================================================
router.get("/:id/pinned", getPinnedFiles);
router.post("/:id/pinned", addPinnedFile);
router.delete("/:id/pinned/:fileId", removePinnedFile);

// ============================================================
// LINKED TASKS
// ============================================================
router.get("/:id/tasks", getLinkedTasks);
router.post("/:id/tasks", linkTask);
router.delete("/:id/tasks/:taskId", unlinkTask);

// ============================================================
// CHANNEL MEMBER MANAGEMENT - ADD THESE
// ============================================================
router.patch("/:id/members/:userId/role", makeAdmin); 
router.get("/:id/members-with-roles", getChannelMembersWithRoles);

module.exports = router;