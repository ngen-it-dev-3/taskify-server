// routes/report.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  getTaskReports,
  getPersonalTaskReport,
  getDepartmentTaskReport,
  getProjectTaskReport,
  exportTaskReport,
} = require("../controllers/report.controller");

const router = express.Router();

// All report routes require authentication
router.use(authenticate);

// Task report endpoints
router.get("/tasks", getTaskReports);
router.get("/tasks/personal", getPersonalTaskReport);
router.get("/tasks/department", getDepartmentTaskReport);
router.get("/tasks/project", getProjectTaskReport);
router.get("/tasks/export", exportTaskReport);

module.exports = router;