// src/services/numberingSettings.service.js
const NumberingSettings = require('../../models/onlineCrm/NumberingSettings.model');

const SINGLETON_KEY = 'global';

/** Always returns a settings doc, creating one if missing. */
async function getSettings() {
  let doc = await NumberingSettings.findOne({ key: SINGLETON_KEY });
  if (!doc) doc = await NumberingSettings.create({ key: SINGLETON_KEY });
  return doc;
}

/** PATCH — merges only the fields sent, scoped to 'quote' or 'pq'. */
async function updateSettings({ scope, payload, userId }) {
  if (!['quote', 'pq'].includes(scope)) {
    throw Object.assign(new Error('Invalid scope'), { status: 400 });
  }

  // Whitelist fields per scope
  const allowed = scope === 'quote'
    ? ['rfqPrefix', 'quotationPrefix', 'yearSegment', 'nextSeq', 'padding', 'resetCycle']
    : ['countryCode', 'regionCode', 'entityCode', 'docTypeCode',
       'useTodayDate', 'manualDate', 'nextSeq', 'padding', 'resetCycle'];

  const patch = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) patch[`${scope}.${k}`] = payload[k];
  }

  const doc = await NumberingSettings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { ...patch, updatedBy: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/* -------------------------------------------------------------
   Reset-cycle helper — decides if the serial should restart
------------------------------------------------------------- */
function shouldReset(cycle, lastResetAt, now = new Date()) {
  if (cycle === 'never') return false;
  if (!lastResetAt) return false;
  const last = new Date(lastResetAt);
  if (cycle === 'yearly')  return last.getFullYear() !== now.getFullYear();
  if (cycle === 'monthly')
    return last.getFullYear() !== now.getFullYear()
        || last.getMonth()    !== now.getMonth();
  return false;
}

/* -------------------------------------------------------------
   Format helpers
------------------------------------------------------------- */
function buildQuoteNumber(scheme, seq) {
  const year = new Date().getFullYear();
  const yearPart =
    scheme.yearSegment === 'none' ? '' :
    scheme.yearSegment === 'yy'   ? String(year).slice(-2) :
                                    String(year);
  const padded = String(seq).padStart(scheme.padding || 4, '0');
  return [scheme.rfqPrefix, yearPart, padded].filter(Boolean).join('-');
}

function buildPqNumber(scheme, seq) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = scheme.useTodayDate
    ? `${yy}${mm}${dd}`
    : (scheme.manualDate || `${yy}${mm}${dd}`).replace(/\D/g, '').slice(0, 6);

  const padded = String(seq).padStart(scheme.padding || 4, '0');
  return `${scheme.countryCode}-${scheme.regionCode}/${scheme.entityCode}/${scheme.docTypeCode}/${datePart}-${padded}`;
}

/* -------------------------------------------------------------
   ⭐ generateNextNumber — ATOMIC. Safe for concurrent users.
   Returns { number, seq }.
------------------------------------------------------------- */
async function generateNextNumber(scope) {
  if (!['quote', 'pq'].includes(scope)) {
    throw Object.assign(new Error('Invalid scope'), { status: 400 });
  }

  // Ensure doc exists
  await getSettings();

  // Read current config (non-atomic read is fine — the $inc below is atomic)
  const before = await NumberingSettings.findOne({ key: SINGLETON_KEY }).lean();
  const scheme = before[scope];

  // Reset check
  const doReset = shouldReset(scheme.resetCycle, scheme.lastResetAt);
  if (doReset) {
    await NumberingSettings.updateOne(
      { key: SINGLETON_KEY },
      { $set: { [`${scope}.nextSeq`]: 0, [`${scope}.lastResetAt`]: new Date() } }
    );
  }

  // Atomically bump and read back
  const updated = await NumberingSettings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $inc: { [`${scope}.nextSeq`]: 1 } },
    { new: true }
  ).lean();

  const seq = updated[scope].nextSeq;
  const number =
    scope === 'quote'
      ? buildQuoteNumber(updated.quote, seq)
      : buildPqNumber(updated.pq, seq);

  return { number, seq, scope };
}

module.exports = {
  getSettings,
  updateSettings,
  generateNextNumber,
  // exported for tests / reuse
  buildQuoteNumber,
  buildPqNumber,
};