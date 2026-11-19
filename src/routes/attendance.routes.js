// routes/attendance.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getTodayAttendance,
  startTimer,
  pauseTimer,
  resumeTimer,
  checkOut,
  getTimerStatus,
  getAllAttendance,
  getAttendanceStats,
  getEmployeeAttendanceHistory,
} = require("../controllers/attendance.controller");
const { syncDeviceLogs } = require("../services/zkSyncService");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// EMPLOYEE ROUTES
// ============================================================================
router.get("/today", getTodayAttendance);
router.post("/start", startTimer);
router.post("/pause", pauseTimer);
router.post("/resume", resumeTimer);
router.post("/checkout", checkOut);
router.get("/timer-status", getTimerStatus);
router.get("/history", getEmployeeAttendanceHistory);

// ============================================================================
// ADMIN ROUTES
// ============================================================================
router.get("/all", requireRole("admin", "super_admin", "hr_manager"), getAllAttendance);
router.get("/stats", requireRole("admin", "super_admin", "hr_manager"), getAttendanceStats);

router.post(
  "/sync-device",
  requireRole("admin", "super_admin", "hr_manager"),
  async (req, res) => {
    try {
      const result = await syncDeviceLogs();
      res.status(result.success ? 200 : 500).json({
        success: result.success,
        message: result.success
          ? `Successfully synced ${result.updated} records.`
          : result.message,
        data: result,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;