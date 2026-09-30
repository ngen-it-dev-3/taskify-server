// src/models/onlineCrm/OnlineQuery.model.js
const mongoose = require('mongoose');

// ============================================================
// ENUMS
// ============================================================
const STAGES = ['To Start', 'Not Quoted', 'Quoted'];
const SOURCES = ['Email', 'Phone', 'Portal', 'Tender Portal', 'Site Visit'];
const STATUSES = ['Pending', 'Quoted', 'Won', 'Lost'];

// ============================================================
// SCHEMA
// ============================================================
const OnlineQuerySchema = new mongoose.Schema(
  {
    // ---- Core identification ----
    rfqNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // ---- Company / client ----
    company: {
      type: String,
      required: [true, 'Company is required'],
      trim: true,
      index: true,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      index: true,
    },

    // ---- Requirement ----
    product: {
      type: String,
      default: '',
      trim: true,
    },
    productCategory: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Assignment ----
    assigned: {
      type: String,
      default: 'Unassigned',
      index: true,
    },

    // ---- Sourcing ----
    source: {
      type: String,
      enum: SOURCES,
      default: 'Email',
      index: true,
    },

    // ---- Commercial ----
    value: {
      type: Number,
      default: null,
      min: 0,
    },

    // ---- Pipeline ----
    stage: {
      type: String,
      enum: STAGES,
      default: 'To Start',
      index: true,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'Pending',
      index: true,
    },

    // ---- Notes ----
    comments: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Optional link back to RFQ if this came from one ----
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
      default: null,
      index: true,
    },

    // ---- Audit ----
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================================
// INDEXES
// ============================================================
OnlineQuerySchema.index({ stage: 1, date: -1 });
OnlineQuerySchema.index({ country: 1, stage: 1 });
OnlineQuerySchema.index({ assigned: 1, stage: 1 });
OnlineQuerySchema.index({ source: 1, date: -1 });

// ============================================================
// VIRTUALS
// ============================================================
OnlineQuerySchema.virtual('daysAging').get(function () {
  if (!this.date) return 0;
  const diff = Date.now() - new Date(this.date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
});

// ============================================================
// STATICS
// ============================================================
OnlineQuerySchema.statics.STAGES = STAGES;
OnlineQuerySchema.statics.SOURCES = SOURCES;
OnlineQuerySchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('OnlineQuery', OnlineQuerySchema);
module.exports.STAGES = STAGES;
module.exports.SOURCES = SOURCES;
module.exports.STATUSES = STATUSES;