// routes/kpi.analytics.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  getAIInsights,
  getPerformancePredictions,
  getDepartmentComparisons,
  getHeatMapData,
} = require("../controllers/kpi.analytics.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// KPI ANALYTICS ROUTES
// ============================================================

// AI-powered insights
router.get("/insights", getAIInsights);

// Performance predictions
router.get("/predictions", getPerformancePredictions);

// Department comparisons
router.get("/department-comparisons", getDepartmentComparisons);

// Heat map data
router.get("/heatmap", getHeatMapData);

module.exports = router;