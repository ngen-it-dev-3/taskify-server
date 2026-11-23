// models/HrDocument.model.js
const mongoose = require("mongoose");

const hrDocumentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Document title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    category: {
      type: String,
      enum: ["form", "policy"],
      required: [true, "Category is required"],
      default: "form",
      index: true,
    },
    fileName: {
      type: String,
      required: [true, "File name is required"],
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
    // e.g., "/uploads/hr-documents/1732360000-leave_form.xlsx"
    fileUrl: {
      type: String,
      required: [true, "File URL is required"],
      trim: true,
    },
    // e.g., disk path on server
    filePath: {
      type: String,
      default: "",
      trim: true,
    },
    version: {
      type: String,
      default: "1.0",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

hrDocumentSchema.index({ category: 1, isActive: 1, updatedAt: -1 });

module.exports = {
  HrDocument: mongoose.model("HrDocument", hrDocumentSchema),
};