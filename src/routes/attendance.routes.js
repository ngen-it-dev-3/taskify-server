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
  getEmployeeAttendanceHistory, // ← ADD THIS
} = require("../controllers/attendance.controller");

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
router.get("/history", getEmployeeAttendanceHistory); // ← ADD THIS

// ============================================================================
// ADMIN ROUTES
// ============================================================================
router.get(
  "/all",
  requireRole("admin", "super_admin", "hr_manager"),
  getAllAttendance,
);
router.get(
  "/stats",
  requireRole("admin", "super_admin", "hr_manager"),
  getAttendanceStats,
);

module.exports = router;
