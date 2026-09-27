// src/utils/quotationNumber.js
const Counter = require('../models/rfq/Counter');

/**
 * Generate a PQ number like: PQ-2026-0201 or NG-BD/EGCB/RV/260918
 */
async function generatePqNumber({ countryCode, companyInitials, rfqNumber, style = 'short' }) {
  const year = new Date().getFullYear();

  if (style === 'short') {
    // Format: PQ-2026-0201
    const key = `pq-${year}`;
    const counter = await Counter.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const seq = String(counter.seq).padStart(4, '0');
    return `PQ-${year}-${seq}`;
  }

  // Format: NG-BD/EGCB/RV/260918
  const cc = (countryCode || 'XX').slice(0, 2).toUpperCase();
  const initials = (companyInitials || 'XX').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  const rfqNo = (rfqNumber || '').replace(/-/g, '');
  return `NG-${cc}/${initials}/RV/${rfqNo}`;
}

module.exports = { generatePqNumber };