// src/models/salesCrm/Forecast.model.js
const mongoose = require('mongoose');

// ============================================================
// STAGE ENUM
// Matches the 6 columns on the Pipeline tab
// ============================================================
const PIPELINE_STAGES = [
  'query',        // Noakhal Sci. & Tech. Univ. column
  'rfq',          // Pubali Bank Limited column
  'quotation',    // Sonali Bank PLC column
  'negotiation',  // EGCB column
  'won',          // Art Communications column
  'lost',         // Janata Bank PLC column
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ============================================================
// SCHEMA
// ============================================================
const ForecastEntrySchema = new mongoose.Schema(
  {
    // ---- Core fields (matches "Add Forecast Entry" modal) ----
    client: {
      type: String,
      required: [true, 'Client is required'],
      trim: true,
      index: true,
    },
    item: {
      type: String,
      default: '',
      trim: true,
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    probability: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    month: {
      type: String,
      enum: MONTHS,
      default: () => MONTHS[new Date().getMonth()],
      index: true,
    },
    stage: {
      type: String,
      enum: PIPELINE_STAGES,
      default: 'quotation',
      index: true,
    },
    source: {
      type: String,
      enum: [
        'online',              // web RFQ / tender portal
        'offline',             // manual / phone / email
        'quotation-builder',   // ⭐ auto-pushed from the builder
        'tender',
        'referral',
      ],
      default: 'offline',
      index: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },

    // ---- Region / ownership scoping ----
    country: {
      type: String,
      default: 'Bangladesh',
      index: true,
    },
    region: {
      type: String,
      default: 'Bangladesh',
      index: true,
    },
    owner: {
      type: String,
      default: '',        // salesperson name (matches "BY SALESPERSON" panel)
      index: true,
    },

    // ---- ⭐ Link back to Quotation / RFQ (for traceability) ----
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
      index: true,
    },
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
      default: null,
      index: true,
    },
    rfqNumber: {
      type: String,
      default: '',
    },
    pqNumber: {
      type: String,
      default: '',
      index: true,
    },

    // ---- Sales Report lifecycle (Screenshot 5) ----
    deliveredAt: { type: Date, default: null },
    invoicedAt:  { type: Date, default: null },
    executedAt:  { type: Date, default: null },
    closedAt:    { type: Date, default: null },

    // ---- Target vs Achieved (Sales Report per month) ----
    monthlyTarget: {
      type: Number,
      default: 0,
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
  }
);

// ============================================================
// INDEXES
// ============================================================
ForecastEntrySchema.index({ month: 1, stage: 1 });
ForecastEntrySchema.index({ owner: 1, month: 1 });
ForecastEntrySchema.index({ source: 1, createdAt: -1 });
ForecastEntrySchema.index({ quotationId: 1 }, { sparse: true });

// ============================================================
// VIRTUALS
// ============================================================
ForecastEntrySchema.virtual('weightedValue').get(function () {
  return Math.round((this.value * this.probability) / 100);
});

ForecastEntrySchema.set('toJSON', { virtuals: true });
ForecastEntrySchema.set('toObject', { virtuals: true });

// ============================================================
// STATIC HELPERS
// ============================================================
ForecastEntrySchema.statics.PIPELINE_STAGES = PIPELINE_STAGES;
ForecastEntrySchema.statics.MONTHS = MONTHS;

module.exports = mongoose.model('ForecastEntry', ForecastEntrySchema);
module.exports.PIPELINE_STAGES = PIPELINE_STAGES;
module.exports.MONTHS = MONTHS;