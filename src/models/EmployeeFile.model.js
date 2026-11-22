const mongoose = require("mongoose");

const employeeFileSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      default: "General",
    },
    documentNumber: {
      type: String,
      trim: true,
      default: "",
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    // --- NEW FIELDS ADDED FOR COMPLETE FILE MANAGEMENT ---
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // ----------------------------------------------------
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: "file",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmployeeFile", employeeFileSchema);