// models/Project.model.js
const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    teamMembers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: {
          type: String,
          enum: ["lead", "member", "contributor"],
          default: "member",
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
        "archived",
      ],
      default: "planning",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    budget: {
      allocated: { type: Number, default: 0 },
      spent: { type: Number, default: 0 },
      currency: { type: String, default: "USD" },
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    tasksCount: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    completedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    // ADD THESE FIELDS FOR ARCHIVE FUNCTIONALITY
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Indexes
projectSchema.index({ code: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ managerId: 1 });
projectSchema.index({ departmentId: 1 });
projectSchema.index({ createdBy: 1 });
projectSchema.index({ archivedAt: 1 });

module.exports = { Project: mongoose.model("Project", projectSchema) };
