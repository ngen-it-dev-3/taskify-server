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
  getSubTasks,
  getMilestones,
  getTaskHierarchy,
  addDependency,
  removeDependency,
  getTaskDependencies,
  getProjectDependencyGraph,
  bulkAddDependencies,
  getDependencyChain,
  updateDependencyType,
  getDependencyStatistics,
  reorderSingleTask,
  getTaskTime,
  getTasksByUser,
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

// ============================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================================
router.use(authenticate);

// EMPLOYEE ROUTES - Must come before /:id routes
router.get("/my-tasks", getMyTasks);
router.get("/my-statistics", getTaskStatistics);
router.get("/user/:userId", getTasksByUser);

// ============================================================
// TASK OPERATIONS
// ============================================================
router.get("/", getTasks);

// ============================================================
// PROJECT-SPECIFIC TASK ROUTES
// ============================================================
router.get("/project/:projectId", getTasksByProject);
router.get("/project/:projectId/summary", getProjectTasksSummary);
router.get("/project/:projectId/milestones", authenticate, getMilestones);

// ============================================================
// 🆕 SUB-TASK ROUTES
// ============================================================
router.get("/:id/subtasks", authenticate, getSubTasks);
router.get("/:id/hierarchy", authenticate, getTaskHierarchy);

// ============================================================
// 🆕 DEPENDENCY ROUTES - MUST COME BEFORE /:id ROUTES
// ============================================================

// Get dependency statistics
router.get("/dependencies/statistics", authenticate, getDependencyStatistics);
router.get(
  "/project/:projectId/dependencies/graph",
  authenticate,
  getProjectDependencyGraph
);


// Get dependency chain for a task
router.get("/:id/dependencies/chain", authenticate, getDependencyChain);

// Get all dependencies for a task
router.get("/:id/dependencies", authenticate, getTaskDependencies);

// Add a single dependency to a task
router.post(
  "/:id/dependencies",
  authenticate,
  [
    body("dependencyTaskId")
      .notEmpty()
      .withMessage("dependencyTaskId is required")
      .isMongoId()
      .withMessage("dependencyTaskId must be a valid ObjectId"),
    body("type")
      .optional()
      .isIn(["FS", "SS", "FF", "SF"])
      .withMessage("Type must be one of: FS, SS, FF, SF"),
    body("lag")
      .optional()
      .isNumeric()
      .withMessage("Lag must be a number"),
  ],
  addDependency
);

// Bulk add dependencies to a task
router.post(
  "/:id/dependencies/bulk",
  authenticate,
  [
    body("dependencies")
      .isArray()
      .withMessage("dependencies must be an array")
      .notEmpty()
      .withMessage("dependencies cannot be empty"),
    body("dependencies.*.taskId")
      .notEmpty()
      .withMessage("Each dependency must have a taskId")
      .isMongoId()
      .withMessage("Each taskId must be a valid ObjectId"),
    body("dependencies.*.type")
      .optional()
      .isIn(["FS", "SS", "FF", "SF"])
      .withMessage("Type must be one of: FS, SS, FF, SF"),
    body("dependencies.*.lag")
      .optional()
      .isNumeric()
      .withMessage("Lag must be a number"),
  ],
  bulkAddDependencies
);

// Update a dependency type or lag
router.put(
  "/:id/dependencies/:dependencyId",
  authenticate,
  [
    body("type")
      .optional()
      .isIn(["FS", "SS", "FF", "SF"])
      .withMessage("Type must be one of: FS, SS, FF, SF"),
    body("lag")
      .optional()
      .isNumeric()
      .withMessage("Lag must be a number"),
  ],
  updateDependencyType
);

// Remove a dependency from a task
router.delete(
  "/:id/dependencies/:dependencyId",
  authenticate,
  removeDependency
);

// ============================================================
// BULK OPERATIONS
// ============================================================
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
  bulkCreateTasks
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
  bulkCreateTasksWithoutProject
);

router.post(
  "/project/:projectId/import",
  authenticate,
  [body("tasks").isArray().withMessage("Tasks must be an array")],
  importTasksFromFile
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
  reorderTasks
);

// ============================================================
// SINGLE TASK OPERATIONS
// ============================================================

// Create task
router.post(
  "/",
  authenticate,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("assignedTo").notEmpty().withMessage("AssignedTo is required"),
    body("projectId").notEmpty().withMessage("ProjectId is required"),
    body("deadline").isISO8601().withMessage("Valid deadline is required"),
    body("isMilestone")
      .optional()
      .isBoolean()
      .withMessage("isMilestone must be boolean"),
    body("parentTaskId")
      .optional()
      .isMongoId()
      .withMessage("parentTaskId must be valid ObjectId"),
    body("startDate")
      .optional()
      .isISO8601()
      .withMessage("startDate must be valid date"),
  ],
  createTask
);

// ============================================================
// SPECIFIC TASK ROUTES - BEFORE /:id
// ============================================================

// Get extension requests
router.get("/:id/extension-requests", authenticate, getExtensionRequests);

// Update task status
router.patch(
  "/:id/status",
  [
    body("status")
      .isIn([
        "pending",
        "in_progress",
        "submitted",
        "completed",
        "overdue",
        "rejected",
      ])
      .withMessage("Invalid status value"),
    body("actualMinutes")
      .optional()
      .isNumeric()
      .withMessage("actualMinutes must be a number"),
    body("evidenceUrls")
      .optional()
      .isArray()
      .withMessage("evidenceUrls must be an array"),
  ],
  updateTaskStatus
);

// Submit evidence
router.post(
  "/:id/evidence",
  authenticate,
  [
    body("evidenceUrls").isArray().withMessage("evidenceUrls must be an array"),
    body("evidenceUrls.*").isURL().withMessage("Each URL must be valid"),
  ],
  submitEvidence
);

// Request extension
router.post(
  "/:id/request-extension",
  [
    body("requestedDate")
      .isISO8601()
      .withMessage("Valid requested date is required"),
    body("reason").notEmpty().withMessage("Reason is required"),
  ],
  requestExtension
);

// ============================================================
// TIMER ROUTES
// ============================================================

// Start timer
router.post("/:id/timer/start", authenticate, startTaskTimer);

// Pause timer
router.post(
  "/:id/timer/pause",
  authenticate,
  [body("elapsedTime").isNumeric().withMessage("elapsedTime must be a number")],
  pauseTaskTimer
);

// Resume timer
router.post("/:id/timer/resume", authenticate, resumeTaskTimer);

// Complete task (also stops timer)
router.patch("/:id/complete", authenticate, completeTask);

// ============================================================
// TASK TIME
// ============================================================

// Get the task's total time (sum of all timer entries)
router.get("/:id/time", authenticate, getTaskTime);

// Update task time (overwrite absolute value)
router.patch(
  "/:id/time",
  authenticate,
  [
    body("actualMinutes")
      .isNumeric()
      .withMessage("actualMinutes must be a number"),
  ],
  updateTaskTime
);

// ============================================================
// APPROVE EXTENSION - With role-based access
// ============================================================
router.post(
  "/:id/approve-extension/:extensionId",
  authenticate,
  requireRole(
    "admin",
    "super_admin",
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
  approveExtension
);

// ============================================================
// REORDER SINGLE TASK
// ============================================================
router.patch(
  "/:id/reorder",
  authenticate,
  [
    body("order").isNumeric().withMessage("Order must be a number"),
    body("status").optional().isString().withMessage("Status must be a string"),
  ],
  reorderSingleTask
);

// ============================================================
// COMMENT ROUTES
// ============================================================
router.get("/:id/comments", getTaskComments);
router.post("/:id/comments", addComment);
router.put("/:id/comments/:commentId", updateComment);
router.delete("/:id/comments/:commentId", deleteComment);
router.post("/:id/comments/:commentId/like", toggleCommentLike);

// ============================================================
// ATTACHMENT ROUTES
// ============================================================
router.get("/:id/attachments", getTaskAttachments);
router.post("/:id/attachments", uploadAttachments);
router.get("/:id/attachments/:attachmentId/download", downloadAttachment);
router.delete("/:id/attachments/:attachmentId", deleteAttachment);

// ============================================================
// REVIEW ROUTES
// ============================================================
router.get("/:id/reviews", getTaskReviews);
router.post("/:id/reviews", addReview);
router.put("/:id/reviews/:reviewId", updateReview);
router.delete("/:id/reviews/:reviewId", deleteReview);
router.post("/:id/reviews/:reviewId/respond", respondToReview);

// ============================================================
// /:id ROUTES - MUST COME LAST
// ============================================================
router.get("/:id", getTaskById);

router.put(
  "/:id",
  authenticate,
  [
    body("isMilestone")
      .optional()
      .isBoolean()
      .withMessage("isMilestone must be boolean"),
    body("parentTaskId")
      .optional()
      .isMongoId()
      .withMessage("parentTaskId must be valid ObjectId"),
  ],
  updateTask
);

router.delete(
  "/:id",
  authenticate,
  requireRole(
    "admin",
    "super_admin",
    "hr_manager",
    "dept_manager",
    "project_manager",
    "line_manager"
  ),
  deleteTask
);

module.exports = router;