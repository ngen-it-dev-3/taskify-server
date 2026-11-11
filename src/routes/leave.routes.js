const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  createLeaveRequest,
  getMyLeaves,
  getAllLeaves,
  getLeaveStats,
  getAdminLeaveStats,
  updateLeaveStatus,
  deleteLeaveRequest,
  getLeaveBalances,
  getAvailableSubstitutes,
  uploadSignature,
} = require("../controllers/leave.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Employee routes
router.post("/", createLeaveRequest);
router.get("/my-leaves", getMyLeaves);
router.get("/my-stats", getLeaveStats);
router.get("/balances", getLeaveBalances);
router.get("/balances/:userId", getLeaveBalances);
router.get("/substitutes", getAvailableSubstitutes);
router.post("/:leaveId/signature", uploadSignature);

// Admin/HR routes
router.get("/all", getAllLeaves);
router.get("/admin-stats", getAdminLeaveStats);
router.patch("/:id/status", updateLeaveStatus);

// Delete route
router.delete("/:id", deleteLeaveRequest);

module.exports = router;
