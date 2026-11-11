// models/KPIWeight.model.js
const mongoose = require("mongoose");

const kpiWeightSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      unique: true,
    },
    weights: {
      taskCompletion: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 20,
      },
      qualityScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 20,
      },
      efficiency: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 20,
      },
      collaboration: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 15,
      },
      innovation: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 15,
      },
      attendance: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 10,
      },
    },
    totalWeight: {
      type: Number,
      default: 100,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Validation to ensure total weight = 100
kpiWeightSchema.pre("save", function(next) {
  const weights = this.weights;
  const total = weights.taskCompletion + weights.qualityScore + 
                weights.efficiency + weights.collaboration + 
                weights.innovation + weights.attendance;
  
  if (total !== 100) {
    next(new Error("Total weight must equal 100%"));
  } else {
    this.totalWeight = total;
    next();
  }
});

module.exports = { KPIWeight: mongoose.model("KPIWeight", kpiWeightSchema) };