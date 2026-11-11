const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  completeOnboarding,
  getOnboardingStatus,
  skipOnboarding,
} = require("../controllers/onboarding.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get onboarding status
router.get("/status", getOnboardingStatus);

// Complete onboarding
router.post("/complete", completeOnboarding);

// Skip onboarding (for testing)
router.post("/skip", skipOnboarding);

module.exports = router;