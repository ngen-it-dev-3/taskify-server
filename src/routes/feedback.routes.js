const express = require("express");
const { body } = require("express-validator");
const {
  submitFeedback,
  getMyFeedback,
  getAllFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  replyToFeedback,
  voteFeedback,
  deleteFeedback,
  getFeedbackStatistics,
} = require("../controllers/feedback.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// ============================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================================
router.use(authenticate);

// ============================================================
// USER ROUTES
// ============================================================

// Submit feedback
router.post(
  "/",
  [
    body("category")
      .isIn(["bug", "feature", "improvement", "general", "praise", "issue"])
      .withMessage("Invalid category"),
    body("subject")
      .notEmpty()
      .withMessage("Subject is required")
      .isLength({ max: 200 })
      .withMessage("Subject must be less than 200 characters"),
    body("message")
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: 5000 })
      .withMessage("Message must be less than 5000 characters"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "critical"])
      .withMessage("Invalid priority"),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
  ],
  submitFeedback
);

// Get my feedback
router.get("/my", getMyFeedback);

// Get feedback statistics
router.get("/statistics", getFeedbackStatistics);

// Vote on feedback
router.post("/:id/vote", voteFeedback);

// ============================================================
// ADMIN ROUTES
// ============================================================

// Get all feedback (admin only)
router.get(
  "/",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager"),
  getAllFeedback
);

// Get feedback by ID
router.get("/:id", getFeedbackById);

// Update feedback status (admin only)
router.patch(
  "/:id/status",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager"),
  [
    body("status")
      .isIn(["pending", "in_progress", "resolved", "closed", "duplicate"])
      .withMessage("Invalid status"),
  ],
  updateFeedbackStatus
);

// Reply to feedback (admin only)
router.post(
  "/:id/reply",
  requireRole("admin", "super_admin", "hr_manager", "dept_manager"),
  [
    body("message")
      .notEmpty()
      .withMessage("Reply message is required")
      .isLength({ max: 2000 })
      .withMessage("Reply must be less than 2000 characters"),
    body("isPublic")
      .optional()
      .isBoolean()
      .withMessage("isPublic must be boolean"),
  ],
  replyToFeedback
);

// Delete feedback (admin or owner)
router.delete("/:id", deleteFeedback);

module.exports = router;