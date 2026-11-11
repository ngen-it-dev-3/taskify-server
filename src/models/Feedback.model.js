const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: ["bug", "feature", "improvement", "general", "praise", "issue"],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved", "closed", "duplicate"],
      default: "pending",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    attachments: [
      {
        url: String,
        filename: String,
        size: Number,
        mimeType: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    adminReply: {
      message: String,
      repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      repliedAt: Date,
      isPublic: {
        type: Boolean,
        default: true,
      },
    },
    votes: {
      type: Number,
      default: 0,
    },
    voters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    tags: [String],
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    pageUrl: String,
    userAgent: String,
    ipAddress: String,
    resolvedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, priority: 1 });
feedbackSchema.index({ category: 1 });
feedbackSchema.index({ subject: "text", message: "text" });

module.exports = mongoose.model("Feedback", feedbackSchema);