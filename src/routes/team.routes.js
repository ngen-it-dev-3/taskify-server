const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  addMembers,
  removeMember,
  getTeamMembers,
  getUserTeams,
  getTeamsByDepartment,
  getTeamStats,
} = require("../controllers/team.controller");

// All routes require authentication
router.use(authenticate);

// ============ TEAM STATISTICS ============
router.get(
  "/stats",
  requireRole("admin", "super_admin", "hr_manager"),
  getTeamStats,
);

// ============ GET USER TEAMS ============
router.get(
  "/user/:userId",
  requireRole("admin", "super_admin", "hr_manager", "employee"),
  getUserTeams,
);

// ============ GET TEAMS BY DEPARTMENT ============
router.get(
  "/department/:department",
  requireRole("admin", "super_admin", "hr_manager"),
  getTeamsByDepartment,
);

// ============ GET ALL TEAMS ============
router.get(
  "/",
  requireRole("admin", "super_admin", "hr_manager", "employee"),
  getAllTeams,
);

// ============ CREATE TEAM ============
router.post("/", requireRole("admin", "super_admin", "hr_manager"), createTeam);

// ============ GET TEAM MEMBERS ============
router.get(
  "/:id/members",
  requireRole("admin", "super_admin", "hr_manager", "employee"),
  getTeamMembers,
);

// ============ ADD MEMBERS TO TEAM ============
router.post(
  "/:id/members",
  requireRole("admin", "super_admin", "hr_manager"),
  addMembers,
);

// ============ REMOVE MEMBER FROM TEAM ============
router.delete(
  "/:id/members/:memberId",
  requireRole("admin", "super_admin", "hr_manager"),
  removeMember,
);

// ============ GET SINGLE TEAM ============
router.get(
  "/:id",
  requireRole("admin", "super_admin", "hr_manager", "employee"),
  getTeamById,
);

// ============ UPDATE TEAM ============
router.put(
  "/:id",
  requireRole("admin", "super_admin", "hr_manager"),
  updateTeam,
);

// ============ DELETE TEAM ============
router.delete("/:id", requireRole("super_admin"), deleteTeam);

module.exports = router;
