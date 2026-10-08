// src/models/quotation/Quotation.model.js
const mongoose = require('mongoose');

const LineItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    sl: { type: mongoose.Schema.Types.Mixed, default: 1 },
    name: { type: String, default: '' },
    qty: { type: Number, default: 1 },
    principalCost: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0 },
    discountPct: { type: Number, default: 0 },
    type: { type: String, enum: ['item', 'fixed'], default: 'item' },
    spec: { type: String, default: '' },
    source1: {
      name: { type: String, default: '' },
      price: { type: String, default: '' },
    },
    source2: {
      name: { type: String, default: '' },
      price: { type: String, default: '' },
    },
    source3: {
      name: { type: String, default: '' },
      price: { type: String, default: '' },
    },
  },
  { _id: false }
);

const TermSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const ClientInfoSchema = new mongoose.Schema(
  {
    company: { type: String, default: '' },
    contactName: { type: String, default: '' },
    designation: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    zipCode: { type: String, default: '' },
  },
  { _id: false }
);

const RatesSchema = new mongoose.Schema(
  {
    principalDiscountPct: { type: Number, default: 0 },
    officePct: { type: Number, default: 1.5 },
    profitPct: { type: Number, default: 8.5 },
    othersPct: { type: Number, default: 5 },
    taxPct: { type: Number, default: 0 },
  },
  { _id: false }
);

const LogisticsSchema = new mongoose.Schema(
  {
    totalWeight: { type: Number, default: 0 },
    totalDimension: { type: String, default: '' },
    clientAskedFor: { type: String, default: 'CIF' },
    productType: { type: String, default: 'DG' },
  },
  { _id: false }
);

const QuotationSchema = new mongoose.Schema(
  {
    // ---- Core identification ----
    pqNumber: { type: String, required: true, unique: true, index: true },
    quotationNumber: { type: String, default: '' }, 
    status: {
      type: String,
      enum: ['draft', 'awaiting_approval', 'sent', 'won', 'lost', 'expired'],
      default: 'draft',
      index: true,
    },
    stage: { type: String, default: 'Negotiation' },

    // ---- RFQ link ----
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
      required: true,
      index: true,
    },
    rfqNumber: { type: String, required: true, index: true },

    // ---- Client ----
    client: { type: ClientInfoSchema, default: {} },
    clientType: { type: String, enum: ['existing', 'new'], default: 'new' },

    // ---- Commercial ----
    territory: { type: String, default: '' },
    crmManager: { type: String, default: '' },
    currency: { type: String, default: 'BDT (base)' },
    currencySymbol: { type: String, default: '৳' },
    exchangeRate: { type: Number, default: 1 },
    vatEnabled: { type: Boolean, default: true },
    discountEnabled: { type: Boolean, default: true },
    pqrNumber: { type: String, default: '' },

    // ⭐ NEW — editable Bill To / Quote Details fields
    billToCompany:     { type: String, default: '' },
    billToContactName: { type: String, default: '' },
    billToContactRole: { type: String, default: '' },
    billToEmail:       { type: String, default: '' },
    billToPhone:       { type: String, default: '' },
    billToAddress:     { type: String, default: '' },
    pqDate:            { type: String, default: '' },
    rfqRefOverride:    { type: String, default: '' },
    
    // ---- Content ----
    lines: { type: [LineItemSchema], default: [] },
    rates: { type: RatesSchema, default: () => ({}) },
    logistics: { type: LogisticsSchema, default: () => ({}) },
    terms: { type: [TermSchema], default: [] },

    // ---- Computed totals (server-side snapshot) ----
    totals: {
      costOfGoods: { type: Number, default: 0 },
      officeExpenses: { type: Number, default: 0 },
      commissionOthers: { type: Number, default: 0 },
      netProfit: { type: Number, default: 0 },
      taxVatGst: { type: Number, default: 0 },
      subTotal: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      customerPrice: { type: Number, default: 0 },
      totalWeight: { type: Number, default: 0 },
    },

    // ---- Lifecycle ----
    sentAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    validUntil: { type: Date },

    // ---- Audit ----
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

QuotationSchema.index({ status: 1, createdAt: -1 });
QuotationSchema.index({ rfqNumber: 1 });

module.exports = mongoose.model('Quotation', QuotationSchema);