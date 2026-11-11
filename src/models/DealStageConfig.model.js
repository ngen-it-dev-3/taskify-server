// src/models/DealStageConfig.model.js
const mongoose = require("mongoose");

const DealStageConfigSchema = new mongoose.Schema(
  {
    stageKey: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "lead_in",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
    },
    label: { type: String, required: true },
    defaultProbability: { type: Number, default: 0, min: 0, max: 100 },
    order: { type: Number, required: true },
    isTerminal: { type: Boolean, default: false },
    color: { type: String, default: "#64748b" },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.DealStageConfig ||
  mongoose.model("DealStageConfig", DealStageConfigSchema);