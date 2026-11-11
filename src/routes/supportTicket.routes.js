// routes/supportTicket.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
    getTickets,
    createTicket,
    replyToTicket,
    closeTicket,
    reopenTicket,
    rateTicket,
    getTicketById,
} = require("../controllers/supportTicket.controller");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, "../uploads/support");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, `support-${uniqueSuffix}-${file.originalname}`);
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'application/zip',
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: images, PDF, Word, Excel, TXT, ZIP'));
        }
    },
});

// All routes require authentication
router.use(authenticate);

// Get all tickets
router.get("/", getTickets);

// Create ticket with file upload
router.post("/", upload.array("attachments", 5), createTicket);

// Get ticket by ID
router.get("/:id", getTicketById);

// Reply to ticket with file upload
router.post("/:id/reply", upload.array("attachments", 5), replyToTicket);

// Close ticket
router.put("/:id/close", closeTicket);

// Reopen ticket
router.put("/:id/reopen", reopenTicket);

// Rate ticket
router.post("/:id/rate", rateTicket);

module.exports = router;