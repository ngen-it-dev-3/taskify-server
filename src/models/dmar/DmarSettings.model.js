// src/models/dmar/DmarSettings.model.js
const mongoose = require('mongoose');

const PLAN_KEYS = ['Site Visit', 'Client Visit', 'Telephone', 'Email', 'Social'];

const PlanEntrySchema = new mongoose.Schema(
  {
    key: { type: String, enum: PLAN_KEYS, required: true },
    planned: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const DmarSettingsSchema = new mongoose.Schema(
  {
    // Which fiscal year + month these targets apply to
    year: { type: Number, required: true, index: true },
    month: { type: String, required: true, index: true },    // 'Oct', 'Nov', etc.

    // Team scope
    team: {
      type: String,
      enum: ['Marketing', 'Sales', 'Both'],
      default: 'Both',
      index: true,
    },

    // Overall monthly sales target
    salesTarget: { type: Number, default: 0 },

    // Activity-level plan
    plan: [PlanEntrySchema],

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

DmarSettingsSchema.index({ year: 1, month: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('DmarSettings', DmarSettingsSchema);
module.exports.PLAN_KEYS = PLAN_KEYS;