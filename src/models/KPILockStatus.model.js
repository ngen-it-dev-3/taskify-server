// models/KPILockStatus.model.js
const mongoose = require("mongoose");

const kpiLockStatusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedAt: {
      type: Date,
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lockReason: {
      type: String,
    },
    unlockedAt: {
      type: Date,
    },
    unlockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    kpiRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KPIJobRun",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique constraint
kpiLockStatusSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

// Index for queries
kpiLockStatusSchema.index({ isLocked: 1 });
kpiLockStatusSchema.index({ month: 1, year: 1 });

module.exports = { KPILockStatus: mongoose.model("KPILockStatus", kpiLockStatusSchema) };