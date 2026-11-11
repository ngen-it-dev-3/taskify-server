// routes/systemStatus.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
    getSystemStatus,
    getServiceStatus,
    getSystemMetrics,
} = require("../controllers/systemStatus.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get overall system status
router.get("/status", getSystemStatus);

// Get specific service status
router.get("/status/services/:serviceId", getServiceStatus);

// Get system metrics
router.get("/metrics", getSystemMetrics);

module.exports = router;