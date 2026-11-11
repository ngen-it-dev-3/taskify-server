const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    response: {
      content: String,
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      respondedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one review per user per task
reviewSchema.index({ taskId: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ taskId: 1, rating: 1 });

module.exports = { Review: mongoose.model("Review", reviewSchema) };