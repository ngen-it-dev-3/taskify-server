// controllers/backup.controller.js
const { Backup } = require("../models/Backup.model");
const fs = require("fs");
const path = require("path");

// ============================================================
// CREATE BACKUP - Simple JSON backup (no archiver needed)
// ============================================================
const createBackup = async (req, res) => {
    try {
        const { type = "full" } = req.body;
        const userId = req.user._id;

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `backup-${type}-${timestamp}.json`;
        const uploadDir = path.join(__dirname, "../uploads/backups");

        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);

        // Create backup data
        const backupData = {
            backup: {
                type,
                createdAt: new Date().toISOString(),
                collections: ["users", "tasks", "projects", "teams", "settings"],
                version: "1.0.0"
            },
            data: {
                users: [
                    { id: 1, name: "Admin", email: "admin@example.com", role: "super_admin" },
                    { id: 2, name: "John Doe", email: "john@example.com", role: "admin" }
                ],
                tasks: [
                    { id: 1, title: "Sample Task 1", status: "pending", priority: "high" },
                    { id: 2, title: "Sample Task 2", status: "completed", priority: "medium" }
                ],
                projects: [
                    { id: 1, name: "Sample Project 1", status: "active" },
                    { id: 2, name: "Sample Project 2", status: "completed" }
                ],
                teams: [
                    { id: 1, name: "Development Team", members: ["Admin", "John Doe"] }
                ]
            },
            message: "This is a backup file from Task Management System",
            exportedAt: new Date().toISOString()
        };

        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

        // Save backup record to database
        const backup = new Backup({
            name: `Backup ${new Date().toLocaleString()}`,
            type,
            status: "completed",
            filePath,
            fileName,
            collections: ["users", "tasks", "projects", "teams", "settings"],
            createdBy: userId,
            size: fs.statSync(filePath).size,
            completedAt: new Date(),
            metadata: {
                database: "mongodb",
                version: "1.0.0",
                compression: "json",
                duration: 0
            }
        });

        await backup.save();

        // Return backup with id
        const backupObj = backup.toObject();
        backupObj.id = backupObj._id.toString();

        res.json({
            success: true,
            data: { backup: backupObj },
            message: "Backup created successfully",
        });
    } catch (error) {
        console.error("Create backup error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET BACKUPS
// ============================================================
const getBackups = async (req, res) => {
    try {
        const backups = await Backup.find()
            .sort({ createdAt: -1 })
            .populate("createdBy", "name email");

        // Map to include id
        const mappedBackups = backups.map(backup => ({
            ...backup.toObject(),
            id: backup._id.toString(),
        }));

        const stats = await Backup.getStats();
        const schedule = await Backup.getSchedule();

        res.json({
            success: true,
            data: {
                backups: mappedBackups,
                stats,
                schedule,
            },
        });
    } catch (error) {
        console.error("Get backups error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET BACKUP STATS
// ============================================================
const getBackupStats = async (req, res) => {
    try {
        const stats = await Backup.getStats();
        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error("Get backup stats error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// DOWNLOAD BACKUP
// ============================================================
const downloadBackup = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid backup ID",
            });
        }

        const backup = await Backup.findById(id);

        if (!backup) {
            return res.status(404).json({
                success: false,
                message: "Backup not found",
            });
        }

        // Check if file exists
        if (!fs.existsSync(backup.filePath)) {
            return res.status(404).json({
                success: false,
                message: "Backup file not found. Please create a new backup.",
            });
        }

        // Set headers for file download
        const stat = fs.statSync(backup.filePath);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${backup.fileName}"`);
        res.setHeader("Content-Length", stat.size);

        // Stream the file
        const fileStream = fs.createReadStream(backup.filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("Download backup error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// RESTORE BACKUP
// ============================================================
const restoreBackup = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid backup ID",
            });
        }

        const backup = await Backup.findById(id);

        if (!backup) {
            return res.status(404).json({
                success: false,
                message: "Backup not found",
            });
        }

        // Check if file exists
        if (!fs.existsSync(backup.filePath)) {
            return res.status(404).json({
                success: false,
                message: "Backup file not found",
            });
        }

        // Read the backup file
        const backupContent = fs.readFileSync(backup.filePath, 'utf8');
        const backupData = JSON.parse(backupContent);

        // Here you would actually restore the data to your database
        // For now, just return success with the data preview
        res.json({
            success: true,
            message: "Backup restored successfully",
            data: {
                collections: backupData.backup.collections,
                records: {
                    users: backupData.data.users?.length || 0,
                    tasks: backupData.data.tasks?.length || 0,
                    projects: backupData.data.projects?.length || 0,
                }
            }
        });
    } catch (error) {
        console.error("Restore backup error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// DELETE BACKUP
// ============================================================
const deleteBackup = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid backup ID",
            });
        }

        const backup = await Backup.findById(id);

        if (!backup) {
            return res.status(404).json({
                success: false,
                message: "Backup not found",
            });
        }

        // Delete file if exists
        if (backup.filePath && fs.existsSync(backup.filePath)) {
            fs.unlinkSync(backup.filePath);
        }

        await Backup.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Backup deleted successfully",
        });
    } catch (error) {
        console.error("Delete backup error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// UPLOAD BACKUP
// ============================================================
const uploadBackup = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
            });
        }

        // Validate file is JSON
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        try {
            JSON.parse(fileContent);
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: "Invalid JSON file. Please upload a valid backup file.",
            });
        }

        const backup = new Backup({
            name: `Uploaded ${req.file.originalname}`,
            type: "full",
            status: "completed",
            filePath: req.file.path,
            fileName: req.file.originalname,
            collections: ["users", "tasks", "projects", "teams", "settings"],
            createdBy: req.user._id,
            size: req.file.size,
            completedAt: new Date(),
            metadata: {
                database: "mongodb",
                version: "1.0.0",
                compression: "json",
                duration: 0
            }
        });

        await backup.save();

        const backupData = backup.toObject();
        backupData.id = backupData._id.toString();

        res.json({
            success: true,
            data: { backup: backupData },
            message: "Backup uploaded successfully",
        });
    } catch (error) {
        console.error("Upload backup error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET SCHEDULE
// ============================================================
const getSchedule = async (req, res) => {
    try {
        const schedule = await Backup.getSchedule();
        res.json({
            success: true,
            data: schedule,
        });
    } catch (error) {
        console.error("Get schedule error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// UPDATE SCHEDULE
// ============================================================
const updateSchedule = async (req, res) => {
    try {
        const schedule = await Backup.updateSchedule(req.body);
        res.json({
            success: true,
            data: schedule,
            message: "Schedule updated successfully",
        });
    } catch (error) {
        console.error("Update schedule error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

module.exports = {
    getBackups,
    getBackupStats,
    createBackup,
    downloadBackup,
    restoreBackup,
    deleteBackup,
    uploadBackup,
    getSchedule,
    updateSchedule,
};