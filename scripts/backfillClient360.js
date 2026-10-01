// scripts/backfillClient360.js
//
// Run:  node scripts/backfillClient360.js

require('dotenv').config();

const mongoose = require('mongoose');

// ---- Models ----
const Client = require('../src/models/Client.model');
const Tender = require('../src/models/Tender.model');
const Quotation = require('../src/models/Quotation.model');
const OnlineQuery = require('../src/models/onlineCrm/OnlineQuery.model');
const DmarActivity = require('../src/models/dmar/DmarActivity.model');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');

// ---- Services ----
const { Client360Service } = require('../src/services/client360/client360.service');

// ---- RFQ (adjust path if different) ----
let RFQ = null;
try {
  RFQ = require('../src/models/rfq/RFQ');
} catch {
  try { RFQ = require('../src/models/RFQ.model'); }
  catch { console.warn('⚠️  RFQ model not found — skipping'); }
}

// ============================================================
async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  CLIENT 360 BACKFILL');
  console.log('═══════════════════════════════════════════════\n');

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) { console.error('❌ No MONGO_URI'); process.exit(1); }

  console.log('🔌 Connecting…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  const before = await Client.countDocuments();
  console.log(`📊 Client 360 BEFORE: ${before}\n`);

  let pushed = 0;

  // ---- 1. Tenders ----
  console.log('─── 1. Tenders ───');
  const tenders = await Tender.find({}).lean();
  console.log(`   Found ${tenders.length}`);
  for (const t of tenders) {
    if (!t.tenderer) continue;
    try {
      const r = await Client360Service.autoCaptureFromTender(t, null);
      if (r) { pushed++; console.log(`   ✓ ${t.tenderer}`); }
    } catch (e) { console.log(`   ✗ ${t.tenderer}: ${e.message}`); }
  }

  // ---- 2. RFQs ----
  if (RFQ) {
    console.log('\n─── 2. RFQs ───');
    const rfqs = await RFQ.find({}).lean();
    console.log(`   Found ${rfqs.length}`);
    for (const r of rfqs) {
      if (!r.company) continue;
      try {
        const result = await Client360Service.autoCaptureFromRfq(r, null);
        if (result) { pushed++; console.log(`   ✓ ${r.company}`); }
      } catch (e) { console.log(`   ✗ ${r.company}: ${e.message}`); }
    }
  }

  // ---- 3. Quotations ----
  console.log('\n─── 3. Quotations ───');
  const quotations = await Quotation.find({}).lean();
  console.log(`   Found ${quotations.length}`);
  for (const q of quotations) {
    if (!q.client?.company) continue;
    try {
      const result = await Client360Service.autoCaptureFromQuotation(q, null);
      if (result) { pushed++; console.log(`   ✓ ${q.client.company}`); }
    } catch (e) { console.log(`   ✗ ${q.client.company}: ${e.message}`); }
  }

  // ---- 4. Online CRM ----
  console.log('\n─── 4. Online CRM ───');
  const onlineQueries = await OnlineQuery.find({}).lean();
  console.log(`   Found ${onlineQueries.length}`);
  for (const o of onlineQueries) {
    if (!o.company) continue;
    try {
      const result = await Client360Service.autoCaptureFromOnlineQuery(o, null);
      if (result) { pushed++; console.log(`   ✓ ${o.company}`); }
    } catch (e) { console.log(`   ✗ ${o.company}: ${e.message}`); }
  }

  // ---- 5. Forecast ----
  console.log('\n─── 5. Forecast Entries ───');
  const forecasts = await ForecastEntry.find({}).lean();
  console.log(`   Found ${forecasts.length}`);
  for (const f of forecasts) {
    if (!f.client) continue;
    try {
      const result = await Client360Service.autoCaptureFromForecast(f, null);
      if (result) { pushed++; console.log(`   ✓ ${f.client}`); }
    } catch (e) { console.log(`   ✗ ${f.client}: ${e.message}`); }
  }

  // ---- 6. DMAR ----
  console.log('\n─── 6. DMAR Activities ───');
  const dmarActivities = await DmarActivity.find({}).lean();
  console.log(`   Found ${dmarActivities.length}`);
  for (const a of dmarActivities) {
    if (!a.company) continue;
    try {
      const result = await Client360Service.autoCaptureFromDmar(a, null);
      if (result) { pushed++; console.log(`   ✓ ${a.company}`); }
    } catch (e) { console.log(`   ✗ ${a.company}: ${e.message}`); }
  }

  // ---- Summary ----
  const after = await Client.countDocuments();

  const bySource = await Client.aggregate([
    { $match: { autoAdded: true } },
    { $group: { _id: '$autoAddedFrom', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  BEFORE:          ${before}`);
  console.log(`  AFTER:           ${after}`);
  console.log(`  Net new clients: ${after - before}`);
  console.log(`  Records processed: ${pushed}`);
  console.log('\n  By source:');
  for (const row of bySource) {
    console.log(`    ${String(row._id || 'unknown').padEnd(15)} ${String(row.count).padStart(3)}`);
  }
  console.log('═══════════════════════════════════════════════');
  console.log('\n✅ Backfill complete.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err);
  process.exit(1);
});