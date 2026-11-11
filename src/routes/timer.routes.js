// routes/timer.routes.js
const express = require("express");
const { body } = require("express-validator");
const {
    getTimerEntries,
    getTimerStats,
    createManualEntry,
    updateTimerEntry,
    deleteTimerEntry,
    getTimerReport,
} = require("../controllers/timer.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// GET ROUTES
// ============================================================

// Get timer entries with filters
router.get("/entries", getTimerEntries);

// Get timer statistics
router.get("/stats", getTimerStats);

// Get timer report (with permission check)
router.get("/report", getTimerReport);

// ============================================================
// POST ROUTES
// ============================================================

// Create manual timer entry
router.post(
    "/entries",
    [
        body("taskId").notEmpty().withMessage("Task ID is required"),
        body("duration")
            .isNumeric()
            .withMessage("Duration must be a number")
            .isInt({ min: 1 })
            .withMessage("Duration must be greater than 0"),
        body("description")
            .optional()
            .isString()
            .withMessage("Description must be a string"),
        body("startTime")
            .optional()
            .isISO8601()
            .withMessage("Invalid start time format"),
        body("isBillable")
            .optional()
            .isBoolean()
            .withMessage("isBillable must be a boolean"),
        body("hourlyRate")
            .optional()
            .isNumeric()
            .withMessage("hourlyRate must be a number"),
    ],
    createManualEntry
);

// ============================================================
// PUT ROUTES
// ============================================================

// Update timer entry
router.put(
    "/entries/:entryId",
    [
        body("description")
            .optional()
            .isString()
            .withMessage("Description must be a string"),
        body("duration")
            .optional()
            .isNumeric()
            .withMessage("Duration must be a number"),
        body("isBillable")
            .optional()
            .isBoolean()
            .withMessage("isBillable must be a boolean"),
        body("hourlyRate")
            .optional()
            .isNumeric()
            .withMessage("hourlyRate must be a number"),
    ],
    updateTimerEntry
);

// ============================================================
// DELETE ROUTES
// ============================================================

// Delete timer entry
router.delete("/entries/:entryId", deleteTimerEntry);

module.exports = router;