// routes/auditLog.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getAuditLogs,
  getAuditLogStats,
  getAuditLogById,
  exportAuditLogs,
  deleteAuditLog,
} = require("../controllers/auditLog.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get audit logs with filters
router.get("/", requireRole("super_admin", "admin"), getAuditLogs);

// Get audit log statistics
router.get("/stats", requireRole("super_admin", "admin"), getAuditLogStats);

// Export audit logs
router.get("/export", requireRole("super_admin", "admin"), exportAuditLogs);

// Get audit log by ID
router.get("/:id", requireRole("super_admin", "admin"), getAuditLogById);

// Delete audit log
router.delete("/:id", requireRole("super_admin", "admin"), deleteAuditLog);

module.exports = router;