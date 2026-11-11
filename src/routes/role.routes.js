const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  seedRoles,
  getPermanentRoles,
  assignRolesToUser,
  removeRoleFromUser,
  getUserRoles,
} = require("../controllers/role.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Public role routes (authenticated users can view)
router.get("/", getRoles);
router.get("/permanent", getPermanentRoles);
router.get("/:id", getRoleById);

// User role management routes
router.get("/user/:userId", getUserRoles);

// ✅ Fixed: Use multiple arguments instead of comma-separated string
router.put("/user/:userId/assign", requireRole("super_admin", "admin"), assignRolesToUser);
router.delete("/user/:userId/role/:roleId", requireRole("super_admin", "admin"), removeRoleFromUser);

// Admin only routes
router.post("/", requireRole("super_admin", "admin"), createRole);
router.put("/:id", requireRole("super_admin", "admin"), updateRole);
router.delete("/:id", requireRole("super_admin", "admin"), deleteRole);
router.post("/seed", requireRole("super_admin"), seedRoles);

module.exports = router;