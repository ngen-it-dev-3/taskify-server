// src/routes/tenant.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  createTrialTenant,
  getMyTenant,
} = require("../controllers/tenant.controller");

const router = express.Router();

/**
 * POST /api/tenant/checkout
 * Public. Creates tenant + users + sends welcome emails.
 */
router.post("/checkout", createTrialTenant);

/**
 * GET /api/tenant/me
 * Private. Returns the tenant of the logged-in user.
 */
router.get("/me", authenticate, getMyTenant);

module.exports = router;