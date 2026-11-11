// src/routes/workload.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getWorkloadCapacity,
  getUserWorkload,
  getWorkloadSummary,
} = require("../controllers/workload.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get workload capacity for all users (admins only)
router.get(
  "/capacity",
  requireRole("super_admin", "admin", "hr_manager", "dept_manager", "line_manager", "project_manager"),
  getWorkloadCapacity
);

// Get workload for a specific user
router.get("/user/:userId", getUserWorkload);

// Get workload summary for dashboard (admins only)
router.get("/summary", requireRole("super_admin", "admin", "hr_manager", "dept_manager"), getWorkloadSummary);

module.exports = router;