// controllers/voice.controller.js
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { Message } = require("../models/Message.model");
const { Channel } = require("../models/Channel.model");
const { uploadToS3 } = require("../services/s3.service");

// ============================================================
// UPLOAD VOICE NOTE
// ============================================================
const uploadVoiceNote = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;

    // Check if channel exists and user is a member
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const isMember = channel.members.some(
      (m) => m.userId.toString() === userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this channel",
      });
    }

    if (!req.files || !req.files.audio) {
      return res.status(400).json({
        success: false,
        message: "No audio file uploaded",
      });
    }

    const audioFile = req.files.audio;
    const fileName = `voice-${uuidv4()}-${Date.now()}.webm`;
    const filePath = path.join(__dirname, "../uploads/voice", fileName);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Move file to uploads directory
    await audioFile.mv(filePath);

    // Upload to S3 (or cloud storage)
    let fileUrl = `${req.protocol}://${req.get("host")}/uploads/voice/${fileName}`;
    
    // If S3 is configured, upload there instead
    if (process.env.S3_BUCKET_NAME) {
      try {
        const s3Url = await uploadToS3(filePath, `voice/${fileName}`, "audio/webm");
        fileUrl = s3Url;
        // Clean up local file after upload to S3
        fs.unlinkSync(filePath);
      } catch (s3Error) {
        console.error("S3 upload error:", s3Error);
        // Keep local file if S3 fails
      }
    }

    const message = new Message({
      channelId,
      senderId: userId,
      type: "voice",
      attachments: [
        {
          name: fileName,
          url: fileUrl,
          size: audioFile.size,
          mimeType: "audio/webm",
          type: "voice",
        },
      ],
    });

    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "fullName email avatar");

    const io = req.app.get("io");
    if (io) {
      io.to(`channel-${channelId}`).emit("message:new", {
        message: populatedMessage,
        channelId,
      });
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Upload voice error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  uploadVoiceNote,
};