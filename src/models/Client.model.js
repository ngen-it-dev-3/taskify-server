// src/models/Client.model.js
const mongoose = require('mongoose');

// ============================================================
// ENUMS
// ============================================================
const TIERS = ['Gold', 'Silver', 'Bronze', 'Standard'];
const SECTORS = [
  'Power & Energy',
  'Financial / Banking',
  'IT & Telecom',
  'Government',
  'University',
  'NGOs',
  'Health Care',
  'Manufacturing',
  'Garments & Buying',
  'Retail',
  'Other',
];
const STAGES = ['hot', 'warm', 'won', 'cold'];
const AUTO_SOURCES = [
  'tender',
  'rfq',
  'quotation',
  'online-crm',
  'sales-crm',
  'dmar',
  'manual',
  'import',
];

// ============================================================
// SUB SCHEMAS
// ============================================================
const VisitSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purpose: { type: String, default: '' },
    notes: { type: String, default: '' },
    location: { type: String, default: '' },
  },
  { _id: true }
);

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: '' },
    department: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    personalEmail: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '' },          // office
    personalPhone: { type: String, default: '' },  // mobile
    notes: { type: String, default: '' },
    isDecisionMaker: { type: Boolean, default: false },
    autoAdded: { type: Boolean, default: false },
    linkedIn: { type: String, default: '' },
  },
  { _id: true, timestamps: true }
);

const QuoteSchema = new mongoose.Schema(
  {
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    qtnNumber: { type: String, default: '' },      // "QTN-2026-2953"
    item: { type: String, default: '' },
    value: { type: Number, default: 0 },
    status: { type: String, default: 'Draft' },    // Draft | Sent | Quoted | Won | Lost
    date: { type: Date, default: null },
  },
  { _id: true }
);

const ContractSchema = new mongoose.Schema(
  {
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract' },
    title: { type: String, default: '' },
    value: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    renewalDue: { type: Date, default: null },
    status: { type: String, default: 'Active' },   // Active | Expired | Renewing
  },
  { _id: true }
);

const CommLogSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['call', 'email', 'meeting', 'note', 'site-visit', 'other'],
      default: 'note',
    },
    summary: { type: String, default: '' },
    body: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    linkedTo: { type: String, default: '' },       // e.g. quote id, contract id
  },
  { _id: true }
);

// ============================================================
// MAIN SCHEMA
// ============================================================
const ClientSchema = new mongoose.Schema(
  {
    // ---------- Identity ----------
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      index: true,
    },
    nameKey: {
      // ⭐ lowercase, trimmed — used for dedup matching
      type: String,
      default: '',
      index: true,
    },
    tier: {
      type: String,
      enum: TIERS,
      default: 'Standard',
      index: true,
    },
    isPartner: { type: Boolean, default: false },   // reseller
    sector: {
      type: String,
      default: '',
      index: true,
    },
    location: { type: String, default: '' },
    city: { type: String, default: '' },
    area: { type: String, default: '' },
    country: { type: String, default: 'Bangladesh', index: true },

    // ---------- Stage / ownership ----------
    stage: {
      type: String,
      enum: STAGES,
      default: 'cold',
      index: true,
    },
    assignedRep: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    team: { type: String, default: '' },            // Marketing | Sales

    // ---------- Financial roll-up ----------
    lifetimeValue: { type: Number, default: 0 },
    ordersFY26: { type: Number, default: 0 },
    avgMarginPct: { type: Number, default: 0 },
    lastOrderAt: { type: Date, default: null },

    // ---------- Auto-capture tracking ----------
    autoAdded: { type: Boolean, default: false, index: true },
    autoAddedFrom: {
      type: String,
      enum: [...AUTO_SOURCES, ''],
      default: '',
      index: true,
    },
    sourceRefs: {
      // ⭐ track where this client came from for dedup
      tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', default: null },
      rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ', default: null },
      quotationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' }],
      onlineQueryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OnlineQuery' }],
      forecastEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ForecastEntry' }],
      dmarActivityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DmarActivity' }],
    },

    // ---------- Contacts ----------
    contacts: [ContactSchema],

    // ---------- Visit history ----------
    lastVisitAt: { type: Date, default: null },
    visitsPerMonth: { type: Number, default: 0 },
    visitLog: [VisitSchema],

    // ---------- Next action ----------
    nextAction: {
      label: { type: String, default: '' },
      dueAt: { type: Date, default: null },
      isOverdue: { type: Boolean, default: false },
    },

    // ---------- Related data ----------
    projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    quotes: [QuoteSchema],
    contracts: [ContractSchema],
    communicationLog: [CommLogSchema],

    // ---------- Notes / misc ----------
    notes: { type: String, default: '', maxlength: 2000 },
    tags: [{ type: String }],
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

    // ---------- Status / audit ----------
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
ClientSchema.index({ name: 'text', sector: 'text', location: 'text' });
ClientSchema.index({ nameKey: 1 }, { unique: false });
ClientSchema.index({ autoAdded: 1, autoAddedFrom: 1 });
ClientSchema.index({ tier: 1, country: 1 });
ClientSchema.index({ country: 1, sector: 1 });

// ============================================================
// PRE-SAVE — auto-generate nameKey + set lastOrderAt from quotes
// ============================================================
ClientSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.nameKey = String(this.name || '').trim().toLowerCase();
  }

  // Compute lifetimeValue + lastOrderAt from quotes (if quotes present)
  if (this.quotes && this.quotes.length > 0) {
    let total = 0;
    let wonCount = 0;
    let last = null;
    for (const q of this.quotes) {
      if (q.status === 'Won' || q.status === 'Sent' || q.status === 'Quoted') {
        total += q.value || 0;
      }
      if (q.status === 'Won') wonCount++;
      if (q.date && (!last || new Date(q.date) > new Date(last))) {
        last = q.date;
      }
    }
    this.lifetimeValue = total;
    if (last) this.lastOrderAt = last;
  }

  next();
});

// ============================================================
// VIRTUALS
// ============================================================
ClientSchema.virtual('openRfqCount', {
  ref: 'RFQ',
  localField: '_id',
  foreignField: 'clientId',
  count: true,
  match: { stage: 'pending' },
});

ClientSchema.virtual('contactCount').get(function () {
  return (this.contacts || []).length;
});

ClientSchema.virtual('hasAutoCapture').get(function () {
  return this.autoAdded === true;
});

// ============================================================
// STATICS
// ============================================================
ClientSchema.statics.TIERS = TIERS;
ClientSchema.statics.SECTORS = SECTORS;
ClientSchema.statics.STAGES = STAGES;
ClientSchema.statics.AUTO_SOURCES = AUTO_SOURCES;

module.exports = mongoose.models.Client || mongoose.model('Client', ClientSchema);
module.exports.TIERS = TIERS;
module.exports.SECTORS = SECTORS;
module.exports.STAGES = STAGES;
module.exports.AUTO_SOURCES = AUTO_SOURCES;