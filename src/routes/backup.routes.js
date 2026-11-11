// routes/backup.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
    getBackups,
    getBackupStats,
    createBackup,
    downloadBackup,
    restoreBackup,
    deleteBackup,
    uploadBackup,
    getSchedule,
    updateSchedule,
} = require("../controllers/backup.controller");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../uploads/backups");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, `backup-${uniqueSuffix}-${file.originalname}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.zip', '.sql', '.json', '.gz'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only .zip, .sql, .json, .gz files are allowed'));
        }
    },
});

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all backups
router.get("/", requireRole("super_admin", "admin"), getBackups);

// Get backup stats
router.get("/stats", requireRole("super_admin", "admin"), getBackupStats);

// Get backup schedule
router.get("/schedule", requireRole("super_admin", "admin"), getSchedule);

// Create backup
router.post("/", requireRole("super_admin", "admin"), createBackup);

// Upload backup file
router.post(
    "/upload",
    requireRole("super_admin", "admin"),
    upload.single("backup"),
    uploadBackup
);

// Update schedule
router.put("/schedule", requireRole("super_admin", "admin"), updateSchedule);

// Download backup
router.get("/:id/download", requireRole("super_admin", "admin"), downloadBackup);

// Restore backup
router.post("/:id/restore", requireRole("super_admin", "admin"), restoreBackup);

// Delete backup
router.delete("/:id", requireRole("super_admin", "admin"), deleteBackup);

module.exports = router;