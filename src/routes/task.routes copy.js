// routes/task.routes.js
const express = require("express");
const { body } = require("express-validator");
const {
  getTasks,
  getMyTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  requestExtension,
  approveExtension,
  deleteTask,
  bulkCreateTasks,
  getTasksByProject,
  importTasksFromFile,
  reorderTasks,
  getProjectTasksSummary,
  getTaskStatistics,
  submitEvidence,
  bulkCreateTasksWithoutProject,
  getExtensionRequests,
  resumeTaskTimer,
  completeTask,
  pauseTaskTimer,
  startTaskTimer,
  updateTaskTime,
} = require("../controllers/task.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getTaskComments,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentLike,
} = require("../controllers/comment.controller");
const {
  uploadAttachments,
  getTaskAttachments,
  downloadAttachment,
  deleteAttachment,
} = require("../controllers/attachment.controller");
const {
  getTaskReviews,
  addReview,
  updateReview,
  deleteReview,
  respondToReview,
} = require("../controllers/review.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============= IMPORTANT: Put specific routes BEFORE dynamic routes =============
// Employee routes - must come before /:id routes
router.get("/my-tasks", getMyTasks);
router.get("/my-statistics", getTaskStatistics);

// ============= TASK OPERATIONS =============
router.get("/", getTasks);

// ============= PROJECT-SPECIFIC TASK ROUTES =============
router.get("/project/:projectId", getTasksByProject);
router.get("/project/:projectId/summary", getProjectTasksSummary);

// ============= BULK OPERATIONS =============
router.post(
  "/project/:projectId/bulk",
  [
    body("tasks").isArray().withMessage("Tasks must be an array"),
    body("tasks.*.title").notEmpty().withMessage("Each task must have a title"),
    body("tasks.*.description")
      .notEmpty()
      .withMessage("Each task must have a description"),
    body("tasks.*.assignedTo")
      .notEmpty()
      .withMessage("Each task must have an assigned user"),
    body("tasks.*.deadline")
      .isISO8601()
      .withMessage("Each task must have a valid deadline"),
  ],
  bulkCreateTasksWithoutProject,
);

router.post(
  "/bulk",
  authenticate,
  [
    body("tasks").isArray().withMessage("Tasks must be an array"),
    body("tasks.*.title").notEmpty().withMessage("Each task must have a title"),
    body("tasks.*.description")
      .notEmpty()
      .withMessage("Each task must have a description"),
    body("tasks.*.assignedTo")
      .notEmpty()
      .withMessage("Each task must have an assigned user"),
    body("tasks.*.deadline")
      .isISO8601()
      .withMessage("Each task must have a valid deadline"),
  ],
  bulkCreateTasksWithoutProject,
);

router.post(
  "/project/:projectId/import",
  authenticate,
  [body("tasks").isArray().withMessage("Tasks must be an array")],
  importTasksFromFile,
);

router.put(
  "/project/:projectId/reorder",
  authenticate,
  [
    body("taskOrders").isArray().withMessage("taskOrders must be an array"),
    body("taskOrders.*.taskId")
      .notEmpty()
      .withMessage("Each item must have a taskId"),
    body("taskOrders.*.order")
      .isNumeric()
      .withMessage("Each item must have an order number"),
  ],
  reorderTasks,
);

// ============= SINGLE TASK OPERATIONS =============
// Create task - no role restriction, any authenticated user
router.post(
  "/",
  authenticate,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("assignedTo").notEmpty().withMessage("AssignedTo is required"),
    body("projectId").notEmpty().withMessage("ProjectId is required"),
    body("deadline").isISO8601().withMessage("Valid deadline is required"),
  ],
  createTask,
);

// ============= IMPORTANT: Specific task routes BEFORE /:id =============
// Get extension requests - specific route
router.get("/:id/extension-requests", authenticate, getExtensionRequests);

// Update task status
router.patch(
  "/:id/status",
  [
    body("status").isIn([
      "pending",
      "in_progress",
      "submitted",
      "completed",
      "overdue",
      "rejected",
    ]).withMessage("Invalid status value"),
  ],
  updateTaskStatus,
);

// Submit evidence
router.post(
  "/:id/evidence",
  authenticate,
  [
    body("evidenceUrls").isArray().withMessage("evidenceUrls must be an array"),
    body("evidenceUrls.*").isURL().withMessage("Each URL must be valid"),
  ],
  submitEvidence,
);

// Extension requests
router.post(
  "/:id/request-extension",
  [
    body("requestedDate")
      .isISO8601()
      .withMessage("Valid requested date is required"),
    body("reason").notEmpty().withMessage("Reason is required"),
  ],
  requestExtension,
);

// ============= TIMER ROUTES =============
// Start timer for a task
router.post(
  "/:id/timer/start",
  authenticate,
  startTaskTimer
);

// Pause timer for a task
router.post(
  "/:id/timer/pause",
  authenticate,
  [
    body("elapsedTime").isNumeric().withMessage("elapsedTime must be a number"),
  ],
  pauseTaskTimer
);

// Resume timer for a task
router.post(
  "/:id/timer/resume",
  authenticate,
  resumeTaskTimer
);

// Complete task (also stops timer)
router.patch(
  "/:id/complete",
  authenticate,
  completeTask
);

// ============================================================
// ✅ FIXED: Approve Extension - More inclusive roles
// ============================================================
router.post(
  "/:id/approve-extension/:extensionId",
  authenticate,
  requireRole(
    "admin",
    "super_admin",   // ✅ ADD THIS
    "hr_manager",
    "dept_manager",
    "project_manager",
    "line_manager"
  ),
  [
    body("newDeadline")
      .isISO8601()
      .withMessage("Valid new deadline is required"),
  ],
  approveExtension,
);
// Update task time (dedicated endpoint)
router.patch(
  "/:id/time",
  authenticate,
  [
    body("actualMinutes").isNumeric().withMessage("actualMinutes must be a number"),
  ],
  updateTaskTime
);

// ============= COMMENT ROUTES =============
router.get("/:id/comments", getTaskComments);
router.post("/:id/comments", addComment);
router.put("/:id/comments/:commentId", updateComment);
router.delete("/:id/comments/:commentId", deleteComment);
router.post("/:id/comments/:commentId/like", toggleCommentLike);

// ============= ATTACHMENT ROUTES =============
router.get("/:id/attachments", getTaskAttachments);
router.post("/:id/attachments", uploadAttachments);
router.get("/:id/attachments/:attachmentId/download", downloadAttachment);
router.delete("/:id/attachments/:attachmentId", deleteAttachment);

// ============= REVIEW ROUTES =============
router.get("/:id/reviews", getTaskReviews);
router.post("/:id/reviews", addReview);
router.put("/:id/reviews/:reviewId", updateReview);
router.delete("/:id/reviews/:reviewId", deleteReview);
router.post("/:id/reviews/:reviewId/respond", respondToReview);

// ============= /:id routes - MUST COME LAST =============
router.get("/:id", getTaskById);
router.put("/:id", authenticate, updateTask);
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin", "hr_manager", "dept_manager", "project_manager", "line_manager"),
  deleteTask
);

module.exports = router;