// src/models/SalesOrder.model.js
const mongoose = require('mongoose');

const SALES_ORDER_STAGES = [
  'Order Placed',
  'Sourcing',
  'Procurement',
  'Delivery',
  'Invoiced',
  'Payment Received',
];

const ORDER_SOURCES = ['quotation', 'tender', 'sales-crm', 'manual'];
const ORDER_TYPES = ['HW', 'SW', 'M', 'SVC'];

const PaymentSchema = new mongoose.Schema(
  {
    status: { type: String, default: 'Not Invoiced' },
    receivedAt: { type: Date, default: null },
    method: { type: String, default: '' },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const StageHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const SalesOrderSchema = new mongoose.Schema(
  {
    // ---- Identity ----
    poRef: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    orderType: {
      type: String,
      enum: ORDER_TYPES,
      default: 'HW',
      index: true,
    },

    // ---- Source links ----
    source: {
      type: String,
      enum: ORDER_SOURCES,
      default: 'quotation',
      index: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
      index: true,
    },
    tenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tender',
      default: null,
      index: true,
    },
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
      default: null,
      index: true,
    },
    forecastEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForecastEntry',
      default: null,
      index: true,
    },
    client360Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },

    // ---- Client snapshot ----
    client: {
      company: { type: String, default: '' },
      contactName: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      country: { type: String, default: '' },
      address: { type: String, default: '' },
    },

    // ---- Product ----
    product: { type: String, default: '' },
    productSpec: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    salesValue: { type: Number, default: 0 },

    // ---- Ownership ----
    salesman: { type: String, default: '' },
    crmManager: { type: String, default: '' },

    // ---- Stage tracking ----
    stage: {
      type: String,
      enum: SALES_ORDER_STAGES,
      default: 'Order Placed',
      index: true,
    },
    stages: {
      orderPlaced:     { type: StageHistorySchema, default: () => ({}) },
      sourcing:        { type: StageHistorySchema, default: () => ({}) },
      procurement:     { type: StageHistorySchema, default: () => ({}) },
      delivery:        { type: StageHistorySchema, default: () => ({}) },
      invoiced:        { type: StageHistorySchema, default: () => ({}) },
      paymentReceived: { type: StageHistorySchema, default: () => ({}) },
    },

    // ---- Procurement ----
    principal: { type: String, default: '' },
    procurementStatus: { type: String, default: 'Not Sent' },
    procurementFileSentAt: { type: Date, default: null },
    procurementRecipients: [{ type: String }],

    // ---- Logistics ----
    logisticsMode: { type: String, default: '' },
    customs: { type: String, default: 'Not Started' },
    logisticsChecklist: {
      cnfAgent: { type: String, default: 'Not assigned' },
      commercialInvoice: { type: String, default: 'Pending' },
      packingList: { type: String, default: 'Pending' },
      billOfLading: { type: String, default: 'Pending' },
      customsDeclaration: { type: String, default: 'Not started' },
      dutyTaxPayment: { type: String, default: 'Not started' },
    },

    // ---- Payment ----
    clientPayment: { type: PaymentSchema, default: () => ({}) },
    principalPayment: { type: PaymentSchema, default: () => ({}) },

    // ---- Dates ----
    orderedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },
    invoicedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    expectedDeliveryDate: { type: Date, default: null },   // ⭐ ADD

    // ---- Notes / audit ----
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ---- Indexes ----
SalesOrderSchema.index({ stage: 1, createdAt: -1 });
SalesOrderSchema.index({ client360Id: 1, stage: 1 });
SalesOrderSchema.index({ source: 1, createdAt: -1 });

// ---- Statics ----
SalesOrderSchema.statics.STAGES = SALES_ORDER_STAGES;
SalesOrderSchema.statics.SOURCES = ORDER_SOURCES;
SalesOrderSchema.statics.ORDER_TYPES = ORDER_TYPES;

module.exports = mongoose.model('SalesOrder', SalesOrderSchema);
module.exports.STAGES = SALES_ORDER_STAGES;
module.exports.SOURCES = ORDER_SOURCES;
module.exports.ORDER_TYPES = ORDER_TYPES;