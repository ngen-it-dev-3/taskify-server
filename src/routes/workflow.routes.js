const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflowStatus,
  duplicateWorkflow,
  executeWorkflow,
  seedWorkflows,
} = require("../controllers/workflow.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Workflow routes
router.get("/", requireRole("admin", "super_admin"), getWorkflows);
router.post("/seed", requireRole("super_admin"), seedWorkflows);
router.get("/:id", requireRole("admin", "super_admin"), getWorkflowById);
router.post("/", requireRole("admin", "super_admin"), createWorkflow);
router.put("/:id", requireRole("admin", "super_admin"), updateWorkflow);
router.delete("/:id", requireRole("admin", "super_admin"), deleteWorkflow);
router.patch(
  "/:id/toggle",
  requireRole("admin", "super_admin"),
  toggleWorkflowStatus,
);
router.post(
  "/:id/duplicate",
  requireRole("admin", "super_admin"),
  duplicateWorkflow,
);
router.post(
  "/:id/execute",
  requireRole("admin", "super_admin"),
  executeWorkflow,
);

module.exports = router;
