// src/models/dmar/DmarActivity.model.js
const mongoose = require('mongoose');

// ============================================================
// ENUMS
// ============================================================
const ACTIVITY_TYPES = ['Visited', 'Called', 'Emailed', 'Posted', 'Social', 'Meeting'];
const CLIENT_TYPES = ['New', 'Existing'];
const TEAMS = ['Marketing', 'Sales'];
const STATUSES = ['To Start', 'In Progress', 'Quoted', 'Sold', 'Lost', 'Archived'];

const MARKETING_SECTORS = [
  'Banks',
  'Government',
  'Education',
  'Small & Medium',
  'Telcos',
  'NGOs',
  'Health Care',
];

const SALES_SECTORS = [
  'Armed Forces',
  'Enterprises',
  'Group of Companies',
  'Health Care',
  'Manufacturers',
  'Garments & Buying',
];

// Union — used by the Log Activity modal dropdown
const ALL_SECTORS = Array.from(
  new Set([...MARKETING_SECTORS, ...SALES_SECTORS])
);

// ============================================================
// SCHEMA
// ============================================================
const DmarActivitySchema = new mongoose.Schema(
  {
    // ---- Core ----
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    activityType: {
      type: String,
      enum: ACTIVITY_TYPES,
      required: true,
      index: true,
    },

    // ---- Company / client ----
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      index: true,
    },
    clientType: {
      type: String,
      enum: CLIENT_TYPES,
      default: 'New',
      index: true,
    },

    // ---- What was offered ----
    product: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Categorization ----
    team: {
      type: String,
      enum: TEAMS,
      default: 'Marketing',
      index: true,
    },
    sector: {
      type: String,
      default: '',
      index: true,
    },
    area: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Commercial ----
    value: {
      type: Number,
      default: null,
      min: 0,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'To Start',
      index: true,
    },

    // ---- Notes / follow-up ----
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    followUpDate: {
      type: Date,
      default: null,
    },

    // ---- Attachments ----
    attachments: [
      {
        name: String,
        url: String,
        size: Number,
        mimeType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ---- Cross-links ----
    syncedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    client360Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    crmEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForecastEntry',
      default: null,
    },

    // ---- Source tracking ----
    source: {
      type: String,
      enum: ['manual', 'task-synced', 'rfq', 'tender', 'quotation', 'import'],
      default: 'manual',
      index: true,
    },

    // ---- Ownership ----
    loggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    loggedByName: {
      type: String,
      default: '',     // cache the name for fast display
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
DmarActivitySchema.index({ date: -1, team: 1 });
DmarActivitySchema.index({ loggedBy: 1, date: -1 });
DmarActivitySchema.index({ sector: 1, team: 1 });
DmarActivitySchema.index({ company: 1, date: -1 });

// ============================================================
// VIRTUALS
// ============================================================
DmarActivitySchema.virtual('daysAging').get(function () {
  if (!this.date) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(this.date).getTime()) / 86400000)
  );
});

// ============================================================
// STATICS
// ============================================================
DmarActivitySchema.statics.ACTIVITY_TYPES = ACTIVITY_TYPES;
DmarActivitySchema.statics.CLIENT_TYPES = CLIENT_TYPES;
DmarActivitySchema.statics.TEAMS = TEAMS;
DmarActivitySchema.statics.STATUSES = STATUSES;
DmarActivitySchema.statics.MARKETING_SECTORS = MARKETING_SECTORS;
DmarActivitySchema.statics.SALES_SECTORS = SALES_SECTORS;
DmarActivitySchema.statics.ALL_SECTORS = ALL_SECTORS;

module.exports = mongoose.model('DmarActivity', DmarActivitySchema);
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
module.exports.CLIENT_TYPES = CLIENT_TYPES;
module.exports.TEAMS = TEAMS;
module.exports.STATUSES = STATUSES;
module.exports.MARKETING_SECTORS = MARKETING_SECTORS;
module.exports.SALES_SECTORS = SALES_SECTORS;
module.exports.ALL_SECTORS = ALL_SECTORS;