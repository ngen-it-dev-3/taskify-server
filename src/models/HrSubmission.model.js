// models/HrSubmission.model.js
const mongoose = require("mongoose");

const hrSubmissionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HrDocument",
      required: [true, "Document template ID is required"],
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Submitter user ID is required"],
      index: true,
    },
    fileName: {
      type: String,
      required: [true, "Submitted file name is required"],
      trim: true,
    },
    fileExt: {
      type: String,
      required: [true, "File extension is required"],
      trim: true,
      lowercase: true,
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required"],
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    fileUrl: {
      type: String,
      required: [true, "Submitted file URL is required"],
      trim: true,
    },
    filePath: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["submitted", "reviewed", "approved", "rejected"],
      default: "submitted",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewComment: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

hrSubmissionSchema.index({ documentId: 1, submittedBy: 1, createdAt: -1 });

module.exports = {
  HrSubmission: mongoose.model("HrSubmission", hrSubmissionSchema),
};