// models/KPIFeedback.model.js
const mongoose = require("mongoose");

const kpiFeedbackSchema = new mongoose.Schema(
  {
    kpiId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KPIScore",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
kpiFeedbackSchema.index({ kpiId: 1, createdAt: -1 });
kpiFeedbackSchema.index({ userId: 1, createdAt: -1 });
kpiFeedbackSchema.index({ createdBy: 1 });
kpiFeedbackSchema.index({ isDeleted: 1 });

// Virtual for feedback count
kpiFeedbackSchema.virtual('feedbackCount').get(function() {
  return this.comment ? 1 : 0;
});

module.exports = { KPIFeedback: mongoose.model("KPIFeedback", kpiFeedbackSchema) };