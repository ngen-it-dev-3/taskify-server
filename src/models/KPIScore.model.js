// models/KPIScore.model.js
const mongoose = require("mongoose");

const kpiScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    month: {
      type: String,
      required: true, // Format: "YYYY-MM"
    },
    year: {
      type: Number,
      required: true,
    },
    scores: {
      taskCompletion: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
      qualityScore: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
      efficiency: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
      collaboration: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
      innovation: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
      attendance: {
        score: { type: Number, default: 0, min: 0, max: 100 },
        weight: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
      },
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    performanceLevel: {
      type: String,
      enum: ["excellent", "good", "average", "needs_improvement"],
      default: "average",
    },
    percentile: {
      type: Number,
      default: 0,
    },
    rank: {
      type: Number,
      default: 0,
    },
    totalEmployees: {
      type: Number,
      default: 0,
    },
    comments: {
      type: String,
      default: "",
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
    calculatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Indexes for performance
kpiScoreSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });
kpiScoreSchema.index({ departmentId: 1, month: 1, year: 1 });
kpiScoreSchema.index({ totalScore: -1 });
kpiScoreSchema.index({ performanceLevel: 1 });

// Pre-save hook to calculate total score and performance level
kpiScoreSchema.pre("save", function (next) {
  const scores = this.scores;
  const total =
    scores.taskCompletion.weightedScore +
    scores.qualityScore.weightedScore +
    scores.efficiency.weightedScore +
    scores.collaboration.weightedScore +
    scores.innovation.weightedScore +
    scores.attendance.weightedScore;

  this.totalScore = Math.round(total * 10) / 10;

  // Determine performance level
  if (this.totalScore >= 90) {
    this.performanceLevel = "excellent";
  } else if (this.totalScore >= 75) {
    this.performanceLevel = "good";
  } else if (this.totalScore >= 60) {
    this.performanceLevel = "average";
  } else {
    this.performanceLevel = "needs_improvement";
  }

  next();
});

module.exports = { KPIScore: mongoose.model("KPIScore", kpiScoreSchema) };
