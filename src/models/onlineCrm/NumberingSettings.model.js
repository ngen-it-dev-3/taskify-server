// src/models/NumberingSettings.model.js
const mongoose = require('mongoose');

/* ---------- Quotation scheme ---------- */
const QuoteSchemeSchema = new mongoose.Schema(
  {
    rfqPrefix:       { type: String, default: 'RFQ', trim: true, uppercase: true },
    quotationPrefix: { type: String, default: 'QTN', trim: true, uppercase: true },
    yearSegment:     { type: String, enum: ['auto', 'yy', 'yyyy', 'none'], default: 'auto' },
    nextSeq:         { type: Number, default: 143, min: 0 },
    padding:         { type: Number, default: 4, min: 1, max: 8 },
    resetCycle:      { type: String, enum: ['never', 'yearly', 'monthly'], default: 'never' },
    lastResetAt:     { type: Date, default: null },
  },
  { _id: false }
);

/* ---------- PQ scheme (segmented) ---------- */
const PqSchemeSchema = new mongoose.Schema(
  {
    countryCode:  { type: String, default: 'NG', trim: true, uppercase: true },
    regionCode:   { type: String, default: 'BD', trim: true, uppercase: true },
    entityCode:   { type: String, default: 'EGCB', trim: true, uppercase: true },
    docTypeCode:  { type: String, default: 'RV', trim: true, uppercase: true },
    useTodayDate: { type: Boolean, default: true },
    manualDate:   { type: String, default: '' },       // YYMMDD
    nextSeq:      { type: Number, default: 1, min: 0 },
    padding:      { type: Number, default: 4, min: 1, max: 8 },
    resetCycle:   { type: String, enum: ['never', 'yearly', 'monthly'], default: 'never' },
    lastResetAt:  { type: Date, default: null },
  },
  { _id: false }
);

const NumberingSettingsSchema = new mongoose.Schema(
  {
    // Singleton document — always one row
    key:  { type: String, default: 'global', unique: true, immutable: true },
    quote: { type: QuoteSchemeSchema, default: () => ({}) },
    pq:    { type: PqSchemeSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NumberingSettings', NumberingSettingsSchema);