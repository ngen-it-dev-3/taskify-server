// src/models/onlineCrm/OnlineQuery.model.js
const mongoose = require('mongoose');

// ============================================================
// ENUMS
// ============================================================
const STAGES = ['To Start', 'Not Quoted', 'Quoted'];
const SOURCES = ['Email', 'Phone', 'Portal', 'Tender Portal', 'Site Visit'];
const STATUSES = ['Pending', 'Quoted', 'Won', 'Lost'];

// ⭐ NEW enums
const CURRENCIES = ['BDT', 'USD', 'SAR', 'AED', 'INR', 'EUR', 'GBP'];
const MODES = ['Online (eGP)', 'Offline', 'Email'];
const PARTICIPATE = ['Yes', 'No', 'Undecided'];
const DOC_STATUS = [
  'Docs pending',
  'Docs in progress',
  'Complete',
  'Banking docs pending',
  '',
];

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

    // ---- DRAFT FLAG (⭐ NEW) ----
    draft: {
      type: Boolean,
      default: false,
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
    description: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Reference (⭐ NEW) ----
    referenceLink: {
      type: String,
      default: '',
      trim: true,
    },
    recordedBy: {
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
    responsiblePerson: {
      type: String,
      default: '',
      trim: true,
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
    // ⭐ NEW — final negotiated value
    bidValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'BDT',
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

    // ---- Dates (⭐ NEW) ----
    lastDateOfPurchase: {
      type: Date,
      default: null,
    },
    lastDateOfSubmission: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },

    // ---- Submission (⭐ NEW) ----
    mode: {
      type: String,
      enum: MODES,
      default: 'Online (eGP)',
    },
    participate: {
      type: String,
      enum: PARTICIPATE,
      default: 'Yes',
    },
    docStatus: {
      type: String,
      enum: DOC_STATUS,
      default: '',
    },

    // ---- Security (⭐ NEW) ----
    securityAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    securityValidity: {
      type: Date,
      default: null,
    },
    performanceSecurityValidity: {
      type: Date,
      default: null,
    },

    // ---- Client contact (⭐ NEW) ----
    contactName: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', trim: true },
    contactAddress: { type: String, default: '', trim: true },

    // ---- Notes / eligibility (⭐ NEW) ----
    comments: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    eligibility: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Optional link back to RFQ ----
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
OnlineQuerySchema.index({ draft: 1, updatedAt: -1 });
OnlineQuerySchema.index({ company: 'text', product: 'text', description: 'text' });

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
OnlineQuerySchema.statics.CURRENCIES = CURRENCIES;

module.exports = mongoose.model('OnlineQuery', OnlineQuerySchema);
module.exports.STAGES = STAGES;
module.exports.SOURCES = SOURCES;
module.exports.STATUSES = STATUSES;
module.exports.CURRENCIES = CURRENCIES;