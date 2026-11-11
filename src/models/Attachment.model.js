const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    metadata: {
      width: Number,
      height: Number,
      duration: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
attachmentSchema.index({ taskId: 1, createdAt: -1 });
attachmentSchema.index({ uploadedBy: 1 });

module.exports = { Attachment: mongoose.model("Attachment", attachmentSchema) };