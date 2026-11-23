const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notice title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Notice description is required"],
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ["HR", "Management", "Supervisor"],
      default: "HR",
    },
    badgeType: {
      type: String,
      enum: ["Warning", "Notice", "Announcement"],
      default: "Notice",
    },
    audience: {
      type: String,
      default: "All Staff",
      trim: true,
    },
    department: {
      type: String,
      default: "All",
      trim: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    postedByLabel: {
      type: String,
      default: "HR",
      trim: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);