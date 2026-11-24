const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
  submitFilledCopy,
  listSubmissions,
  reviewSubmission,
} = require("../controllers/hrDocuments.controller");

const router = express.Router();

// Disk storage for /uploads/hr-documents
const hrUploadDir = path.join(process.cwd(), "uploads", "hr-documents");
if (!fs.existsSync(hrUploadDir)) {
  fs.mkdirSync(hrUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(hrUploadDir)) {
      fs.mkdirSync(hrUploadDir, { recursive: true });
    }
    cb(null, hrUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const baseName = path
      .basename(file.originalname || "document", ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${baseName}${ext}`);
  },
});

const uploadHrFile = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// All HR document routes require authentication
router.use(authenticate);

// Submission review route (must come before "/:id")
router.patch(
  "/submissions/:submissionId/status",
  requireRole("super_admin", "admin", "hr_manager"),
  reviewSubmission
);

// Templates / Documents (Forms & Policies)
router.get("/", listDocuments);
router.post(
  "/",
  requireRole("super_admin", "admin", "hr_manager"),
  uploadHrFile.single("file"),
  createDocument
);

// Download blank template
router.get("/:id/download", downloadDocument);

// Employee filled copy submissions
router.get("/:id/submissions", listSubmissions);
router.post(
  "/:id/submissions",
  uploadHrFile.single("file"),
  submitFilledCopy
);

// Single document operations
router.get("/:id", getDocumentById);
router.put(
  "/:id",
  requireRole("super_admin", "admin", "hr_manager"),
  uploadHrFile.single("file"),
  updateDocument
);
router.patch(
  "/:id",
  requireRole("super_admin", "admin", "hr_manager"),
  uploadHrFile.single("file"),
  updateDocument
);
router.delete(
  "/:id",
  requireRole("super_admin", "admin", "hr_manager"),
  deleteDocument
);

module.exports = router;