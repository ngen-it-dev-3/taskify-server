const { Attachment } = require("../models/Attachment.model");
const { Task } = require("../models/Task.model");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/tasks");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).array("attachments", 10); // Max 10 files

// Upload attachments
const uploadAttachments = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    
    // Verify task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: "No files uploaded" });
      }

      const attachments = [];
      
      for (const file of req.files) {
        const attachment = await Attachment.create({
          taskId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `/uploads/tasks/${file.filename}`,
          uploadedBy: req.user._id,
        });
        
        attachments.push(attachment);
      }

      // Update task's attachments count
      await Task.findByIdAndUpdate(taskId, {
        $inc: { attachmentsCount: attachments.length }
      });

      const populatedAttachments = await Attachment.find({ _id: { $in: attachments.map(a => a._id) } })
        .populate("uploadedBy", "fullName email");

      res.status(201).json({
        success: true,
        message: `${attachments.length} file(s) uploaded successfully`,
        data: populatedAttachments,
      });
    });
  } catch (error) {
    console.error("Upload attachments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get all attachments for a task
const getTaskAttachments = async (req, res) => {
  try {
    const { id: taskId } = req.params;

    const attachments = await Attachment.find({ taskId })
      .populate("uploadedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: attachments,
      count: attachments.length,
    });
  } catch (error) {
    console.error("Get task attachments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Download attachment
const downloadAttachment = async (req, res) => {
  try {
    const { id: taskId, attachmentId } = req.params;

    const attachment = await Attachment.findOne({ _id: attachmentId, taskId });
    
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    const filePath = path.join(__dirname, "../uploads/tasks", attachment.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "File not found on server" });
    }

    res.download(filePath, attachment.originalName);
  } catch (error) {
    console.error("Download attachment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete attachment
const deleteAttachment = async (req, res) => {
  try {
    const { id: taskId, attachmentId } = req.params;

    const attachment = await Attachment.findOne({ _id: attachmentId, taskId });
    
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    // Check permissions
    if (attachment.uploadedBy.toString() !== req.user._id.toString() && 
        !["admin", "super_admin", "dept_manager"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Unauthorized to delete this attachment" });
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, "../uploads/tasks", attachment.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await attachment.deleteOne();

    // Update task's attachments count
    await Task.findByIdAndUpdate(taskId, {
      $inc: { attachmentsCount: -1 }
    });

    res.json({
      success: true,
      message: "Attachment deleted successfully",
    });
  } catch (error) {
    console.error("Delete attachment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  uploadAttachments,
  getTaskAttachments,
  downloadAttachment,
  deleteAttachment,
};