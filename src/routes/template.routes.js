const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  seedTemplates,
} = require("../controllers/template.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Template routes
router.get("/", requireRole("admin", "super_admin", "employee"), getTemplates);
router.post("/seed", requireRole("super_admin"), seedTemplates);
router.get("/:id", requireRole("admin", "super_admin"), getTemplateById);
router.post("/", requireRole("admin", "super_admin"), createTemplate);
router.put("/:id", requireRole("admin", "super_admin"), updateTemplate);
router.delete("/:id", requireRole("admin", "super_admin"), deleteTemplate);
router.post("/:id/apply", requireRole("admin", "super_admin"), applyTemplate);

module.exports = router;
