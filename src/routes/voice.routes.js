// routes/voice.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Configure multer for voice uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const voiceDir = path.join(__dirname, "../../uploads/voice");
    if (!fs.existsSync(voiceDir)) {
      fs.mkdirSync(voiceDir, { recursive: true });
    }
    cb(null, voiceDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `voice-${uniqueSuffix}.webm`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["audio/webm", "audio/mpeg", "audio/wav", "audio/ogg"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter,
});

// Upload voice note
router.post("/upload", authenticate, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No audio file uploaded",
      });
    }

    const fileUrl = `/uploads/voice/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "Voice note uploaded successfully",
      data: {
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error("Error uploading voice note:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload voice note",
      error: error.message,
    });
  }
});

module.exports = router;