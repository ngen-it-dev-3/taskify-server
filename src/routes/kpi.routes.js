// routes/kpi.routes.js - Complete Updated Version
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getKPIWeights,
  upsertKPIWeights,
  getAllKPIWeights,
  calculateKPIScores,
  getEmployeeKPIScores,
  getDepartmentKPIScores,
  getMonthlyKPIReport,
  getKPITrend,
  getEmployeeKPI,
  getDepartmentKPI,
  getKPILeaderboard,
  getKPIStatistics,
  checkKPILockStatus,
  unlockKPI,
  deleteKPIFeedback,
  updateKPIFeedback,
  addKPIFeedback,
  getKPIFeedback,
  lockKPI,
} = require("../controllers/kpi.controller");

const router = express.Router();

// ============================================================
// All routes require authentication
// ============================================================
router.use(authenticate);

// ============================================================
// KPI WEIGHT MANAGEMENT
// ============================================================

// GET all KPI weights (no params) - MUST come FIRST
router.get(
  "/weights",
  requireRole("admin", "super_admin", "hr_manager", "employee", "dept_manager", "project_manager"),
  getAllKPIWeights
);

// GET KPI weights by department
router.get(
  "/weights/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getKPIWeights
);

// PUT KPI weights by department - Only admins and dept managers can modify
router.put(
  "/weights/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  upsertKPIWeights
);

// ============================================================
// KPI CALCULATION - Admin only
// ============================================================

router.post(
  "/calculate/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  calculateKPIScores
);

// ============================================================
// KPI SCORE RETRIEVAL
// ============================================================

// GET employee KPI trend - specific route FIRST
router.get(
  "/employee/:userId/trend",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getKPITrend
);

// GET employee KPI scores
router.get(
  "/employee/:userId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getEmployeeKPIScores
);

// GET department KPI scores
router.get(
  "/department/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getDepartmentKPIScores
);

// ============================================================
// KPI LEADERBOARD
// ============================================================

// GET KPI leaderboard for a department
router.get(
  "/leaderboard/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getKPILeaderboard
);

// GET KPI leaderboard for all departments (admin only)
router.get(
  "/leaderboard",
  requireRole("admin", "super_admin", "hr_manager", "employee", "dept_manager", "project_manager", "employee"),
  getKPILeaderboard
);

// ============================================================
// KPI STATISTICS
// ============================================================

// GET KPI statistics for a department
router.get(
  "/statistics/:departmentId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getKPIStatistics
);

// GET KPI statistics for all departments (admin only)
router.get(
  "/statistics",
  requireRole("admin", "super_admin", "hr_manager", "employee", "dept_manager", "project_manager", "employee"),
  getKPIStatistics
);

// ============================================================
// MONTHLY REPORT - Must be after specific routes
// ============================================================

// GET monthly KPI report with optional month/year params
// If no params provided, uses current month
router.get(
  "/report/monthly",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getMonthlyKPIReport
);

// ============================================================
// KPI DASHBOARD - Catch-all route (must be LAST)
// ============================================================

// GET KPI dashboard data
router.get(
  "/dashboard",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getEmployeeKPI
);

// GET employee KPI overview (alias for dashboard)
router.get(
  "/my-kpi",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getEmployeeKPI
);


// ============================================================
// KPI FEEDBACK ROUTES - Add to your kpi.routes.js
// ============================================================

// GET all feedback for a KPI
router.get(
  "/feedback/:kpiId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  getKPIFeedback
);

// POST add feedback to a KPI
router.post(
  "/feedback/:kpiId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  addKPIFeedback
);

// PUT update feedback
router.put(
  "/feedback/:kpiId/:feedbackId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  updateKPIFeedback
);

// DELETE feedback
router.delete(
  "/feedback/:kpiId/:feedbackId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  deleteKPIFeedback
);

// GET check if KPI is locked
router.get(
  "/lock-status/:userId",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "employee"),
  checkKPILockStatus
);

// POST lock KPI (Admin only)
router.post(
  "/lock/:userId",
  requireRole("admin", "super_admin"),
  lockKPI
);

// POST unlock KPI (Admin only)
router.post(
  "/unlock/:userId",
  requireRole("admin", "super_admin"),
  unlockKPI
);


module.exports = router;
