// src/routes/credential.routes.js
const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  listCredentialUsers,
  toggleCredentialAccess,
  getCredentialLogs,
  logCredentialAction,
} = require("../controllers/tender/credential.controller");

router.use(authenticate);

router.get("/users", requireRole("admin", "super_admin"), listCredentialUsers);
router.patch("/users/:id/access", requireRole("admin", "super_admin"), toggleCredentialAccess);
router.get("/logs", requireRole("admin", "super_admin"), getCredentialLogs);
router.post("/log", logCredentialAction);

module.exports = router;