// controllers/hrDocuments.controller.js
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { HrDocument } = require("../models/HrDocument.model");
const { HrSubmission } = require("../models/HrSubmission.model");

const ALLOWED_EXTENSIONS = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".ppt",
    ".pptx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const HR_UPLOADS_DIR = path.join(process.cwd(), "uploads", "hr-documents");

const ensureUploadDir = () => {
    if (!fs.existsSync(HR_UPLOADS_DIR)) {
        fs.mkdirSync(HR_UPLOADS_DIR, { recursive: true });
    }
};

const isPrivilegedHR = (user) => {
    if (!user || !user.role) return false;
    return ["super_admin", "admin", "hr_manager"].includes(user.role);
};

const safeUnlink = (targetPath) => {
    if (!targetPath) return;
    try {
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
        }
    } catch (err) {
        console.warn("Failed to remove old file:", targetPath, err.message);
    }
};

const extractUploadedFileMeta = (file) => {
    if (!file) {
        return { error: "File is required." };
    }

    const originalName = (file.originalname || "document").trim();
    const ext = path.extname(originalName).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
        safeUnlink(file.path);
        return {
            error: `Unsupported file type (${ext || "none"}). Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
        };
    }

    const byteSize = Number(file.size || 0);
    if (byteSize > MAX_FILE_BYTES) {
        safeUnlink(file.path);
        return { error: "File size exceeds the 10MB limit." };
    }

    const storedName = file.filename || path.basename(file.path || "");
    const relativeUrl = `/uploads/hr-documents/${storedName}`;

    return {
        fileName: originalName,
        fileExt: ext,
        mimeType: file.mimetype || "application/octet-stream",
        fileSize: byteSize,
        fileUrl: relativeUrl,
        filePath: file.path || path.join(HR_UPLOADS_DIR, storedName),
    };
};

// ============================================================
// GET /api/hr-documents?category=form|policy&search=
// ============================================================
const listDocuments = async (req, res) => {
    try {
        const { category, search = "" } = req.query;
        const filter = { isActive: true };

        if (category && ["form", "policy"].includes(String(category).toLowerCase())) {
            filter.category = String(category).toLowerCase();
        }

        if (search && String(search).trim()) {
            const regex = new RegExp(String(search).trim(), "i");
            filter.$or = [
                { title: regex },
                { description: regex },
                { fileName: regex },
                { fileExt: regex },
            ];
        }

        const documents = await HrDocument.find(filter)
            .populate("uploadedBy", "fullName email role")
            .populate("updatedBy", "fullName email role")
            .sort({ updatedAt: -1 });

        const docIds = documents.map((d) => d._id);
        const submissionCounts = await HrSubmission.aggregate([
            { $match: { documentId: { $in: docIds } } },
            { $group: { _id: "$documentId", count: { $sum: 1 } } },
        ]);

        const countMap = new Map(
            submissionCounts.map((item) => [item._id.toString(), item.count])
        );

        const data = documents.map((doc) => {
            const obj = doc.toObject();
            obj.submissionCount = countMap.get(doc._id.toString()) || 0;
            return obj;
        });

        return res.json({
            success: true,
            data,
            count: data.length,
        });
    } catch (error) {
        console.error("List HR documents error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load HR documents",
            error: error.message,
        });
    }
};

// ============================================================
// GET /api/hr-documents/:id
// ============================================================
const getDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const doc = await HrDocument.findById(id)
            .populate("uploadedBy", "fullName email role")
            .populate("updatedBy", "fullName email role");

        if (!doc || !doc.isActive) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        return res.json({ success: true, data: doc });
    } catch (error) {
        console.error("Get HR document error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch document",
            error: error.message,
        });
    }
};

// ============================================================
// POST /api/hr-documents (Upload Form or Policy Template)
// ============================================================
const createDocument = async (req, res) => {
    try {
        ensureUploadDir();

        const {
            title,
            description = "",
            category = "form",
            version = "1.0",
        } = req.body;

        if (!title || !String(title).trim()) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: "Title is required",
            });
        }

        const normalizedCategory = String(category).toLowerCase();
        if (!["form", "policy"].includes(normalizedCategory)) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: "Category must be either 'form' or 'policy'",
            });
        }

        const fileMeta = extractUploadedFileMeta(req.file);
        if (fileMeta.error) {
            return res.status(400).json({
                success: false,
                message: fileMeta.error,
            });
        }

        const created = await HrDocument.create({
            title: String(title).trim(),
            description: String(description || "").trim(),
            category: normalizedCategory,
            fileName: fileMeta.fileName,
            fileExt: fileMeta.fileExt,
            mimeType: fileMeta.mimeType,
            fileSize: fileMeta.fileSize,
            fileUrl: fileMeta.fileUrl,
            filePath: fileMeta.filePath,
            version: String(version || "1.0").trim(),
            uploadedBy: req.user._id,
            updatedBy: req.user._id,
        });

        const populated = await HrDocument.findById(created._id)
            .populate("uploadedBy", "fullName email role")
            .populate("updatedBy", "fullName email role");

        return res.status(201).json({
            success: true,
            message: `${normalizedCategory === "policy" ? "Policy" : "Form"} template uploaded successfully`,
            data: populated,
        });
    } catch (error) {
        if (req.file?.path) safeUnlink(req.file.path);
        console.error("Create HR document error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to upload document template",
            error: error.message,
        });
    }
};

// ============================================================
// PUT / PATCH /api/hr-documents/:id (Update metadata or replace file)
// ============================================================
const updateDocument = async (req, res) => {
    try {
        ensureUploadDir();

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const existing = await HrDocument.findById(id);
        if (!existing || !existing.isActive) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        const updates = {
            updatedBy: req.user._id,
        };

        if (req.body.title !== undefined) {
            if (!String(req.body.title).trim()) {
                if (req.file?.path) safeUnlink(req.file.path);
                return res.status(400).json({ success: false, message: "Title cannot be empty" });
            }
            updates.title = String(req.body.title).trim();
        }

        if (req.body.description !== undefined) {
            updates.description = String(req.body.description || "").trim();
        }

        if (req.body.category !== undefined) {
            const cat = String(req.body.category).toLowerCase();
            if (!["form", "policy"].includes(cat)) {
                if (req.file?.path) safeUnlink(req.file.path);
                return res.status(400).json({ success: false, message: "Invalid category" });
            }
            updates.category = cat;
        }

        if (req.body.version !== undefined) {
            updates.version = String(req.body.version).trim() || existing.version;
        }

        let previousFilePath = null;
        if (req.file) {
            const fileMeta = extractUploadedFileMeta(req.file);
            if (fileMeta.error) {
                return res.status(400).json({ success: false, message: fileMeta.error });
            }

            previousFilePath = existing.filePath;
            updates.fileName = fileMeta.fileName;
            updates.fileExt = fileMeta.fileExt;
            updates.mimeType = fileMeta.mimeType;
            updates.fileSize = fileMeta.fileSize;
            updates.fileUrl = fileMeta.fileUrl;
            updates.filePath = fileMeta.filePath;
        }

        const updated = await HrDocument.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        )
            .populate("uploadedBy", "fullName email role")
            .populate("updatedBy", "fullName email role");

        if (previousFilePath && previousFilePath !== updated.filePath) {
            safeUnlink(previousFilePath);
        }

        return res.json({
            success: true,
            message: "Document updated successfully",
            data: updated,
        });
    } catch (error) {
        if (req.file?.path) safeUnlink(req.file.path);
        console.error("Update HR document error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update document",
            error: error.message,
        });
    }
};

// ============================================================
// DELETE /api/hr-documents/:id (Soft delete)
// ============================================================
const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const doc = await HrDocument.findByIdAndUpdate(
            id,
            { $set: { isActive: false, updatedBy: req.user._id } },
            { new: true }
        );

        if (!doc) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        return res.json({
            success: true,
            message: "Document removed successfully",
        });
    } catch (error) {
        console.error("Delete HR document error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete document",
            error: error.message,
        });
    }
};

// ============================================================
// GET /api/hr-documents/:id/download
// ============================================================
const downloadDocument = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const doc = await HrDocument.findById(id);
        if (!doc || !doc.isActive) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }

        const resolvedDiskPath =
            doc.filePath ||
            (doc.fileUrl ? path.join(process.cwd(), doc.fileUrl.replace(/^\/+/, "")) : "");

        if (resolvedDiskPath && fs.existsSync(resolvedDiskPath)) {
            return res.download(resolvedDiskPath, doc.fileName);
        }

        if (doc.fileUrl) {
            return res.json({
                success: true,
                data: {
                    fileName: doc.fileName,
                    fileUrl: doc.fileUrl,
                },
            });
        }

        return res.status(404).json({
            success: false,
            message: "File not found on server",
        });
    } catch (error) {
        console.error("Download HR document error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to download document",
            error: error.message,
        });
    }
};

// ============================================================
// POST /api/hr-documents/:id/submissions (Upload Filled Copy)
// ============================================================
const submitFilledCopy = async (req, res) => {
    try {
        ensureUploadDir();

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const doc = await HrDocument.findById(id).select("_id title isActive");
        if (!doc || !doc.isActive) {
            if (req.file?.path) safeUnlink(req.file.path);
            return res.status(404).json({ success: false, message: "Template document not found" });
        }

        const fileMeta = extractUploadedFileMeta(req.file);
        if (fileMeta.error) {
            return res.status(400).json({
                success: false,
                message: fileMeta.error,
            });
        }

        const { notes = "" } = req.body;

        const submission = await HrSubmission.create({
            documentId: doc._id,
            submittedBy: req.user._id,
            fileName: fileMeta.fileName,
            fileExt: fileMeta.fileExt,
            mimeType: fileMeta.mimeType,
            fileSize: fileMeta.fileSize,
            fileUrl: fileMeta.fileUrl,
            filePath: fileMeta.filePath,
            notes: String(notes || "").trim(),
            status: "submitted",
        });

        const populated = await HrSubmission.findById(submission._id)
            .populate("documentId", "title category fileExt")
            .populate("submittedBy", "fullName email employeeId role");

        return res.status(201).json({
            success: true,
            message: "Filled copy uploaded successfully",
            data: populated,
        });
    } catch (error) {
        if (req.file?.path) safeUnlink(req.file.path);
        console.error("Submit filled copy error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to upload filled copy",
            error: error.message,
        });
    }
};

// ============================================================
// GET /api/hr-documents/:id/submissions
// ============================================================
const listSubmissions = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid document ID" });
        }

        const filter = { documentId: id };

        if (!isPrivilegedHR(req.user)) {
            filter.submittedBy = req.user._id;
        }

        const submissions = await HrSubmission.find(filter)
            .populate("documentId", "title category fileExt")
            .populate("submittedBy", "fullName email employeeId role")
            .populate("reviewedBy", "fullName email role")
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            data: submissions,
            count: submissions.length,
        });
    } catch (error) {
        console.error("List HR submissions error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load submissions",
            error: error.message,
        });
    }
};

// ============================================================
// PATCH /api/hr-documents/submissions/:submissionId/status
// ============================================================
const reviewSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { status, reviewComment = "" } = req.body;

        if (!mongoose.Types.ObjectId.isValid(submissionId)) {
            return res.status(400).json({ success: false, message: "Invalid submission ID" });
        }

        if (!["submitted", "reviewed", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid submission status" });
        }

        const updated = await HrSubmission.findByIdAndUpdate(
            submissionId,
            {
                $set: {
                    status,
                    reviewComment: String(reviewComment || "").trim(),
                    reviewedBy: req.user._id,
                    reviewedAt: new Date(),
                },
            },
            { new: true }
        )
            .populate("documentId", "title category fileExt")
            .populate("submittedBy", "fullName email employeeId role")
            .populate("reviewedBy", "fullName email role");

        if (!updated) {
            return res.status(404).json({ success: false, message: "Submission not found" });
        }

        return res.json({
            success: true,
            message: "Submission status updated",
            data: updated,
        });
    } catch (error) {
        console.error("Review submission error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to review submission",
            error: error.message,
        });
    }
};

module.exports = {
    listDocuments,
    getDocumentById,
    createDocument,
    updateDocument,
    deleteDocument,
    downloadDocument,
    submitFilledCopy,
    listSubmissions,
    reviewSubmission,
};