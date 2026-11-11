// src/models/DealActivity.model.js
const mongoose = require("mongoose");

const DealActivitySchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "call",
        "email",
        "follow_up",
        "meeting",
        "note",
        "stage_change",
        "task_created",
      ],
      required: true,
      index: true,
    },

    summary: { type: String, required: true, trim: true, maxlength: 500 },
    details: { type: String, default: "", maxlength: 2000 },

    // For calls/meetings
    duration: { type: Number, default: 0 }, // minutes

    // For stage_change
    metadata: {
      fromStage: { type: String },
      toStage: { type: String },
      taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    },

    // Optional scheduled follow-up
    scheduledFor: { type: Date, default: null },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

DealActivitySchema.index({ leadId: 1, createdAt: -1 });
DealActivitySchema.index({ createdBy: 1, createdAt: -1 });

module.exports =
  mongoose.models.DealActivity ||
  mongoose.model("DealActivity", DealActivitySchema);