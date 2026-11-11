// scripts/backfillSalesOrders.js
//
// Run:  node scripts/backfillSalesOrders.js
//
// Creates Sales Orders for every WON quotation/tender/forecast that doesn't
// have one yet. Safe to run multiple times.

require('dotenv').config();
const mongoose = require('mongoose');

const SalesOrder = require('../src/models/salesOrder/SalesOrder.model');
const Quotation = require('../src/models/Quotation.model');
const Tender = require('../src/models/Tender.model');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');
const { SalesOrderService } = require('../src/services/salesOrder/salesOrder.service');

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SALES ORDER BACKFILL');
  console.log('═══════════════════════════════════════════════\n');

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) { console.error('❌ No MONGO_URI'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  const before = await SalesOrder.countDocuments();
  console.log(`📊 Sales Orders BEFORE: ${before}\n`);

  let created = 0;
  let skipped = 0;

  // ---- 1. Won Quotations ----
  console.log('─── 1. Won Quotations ───');
  const quotations = await Quotation.find({ status: 'won' }).lean();
  console.log(`   Found ${quotations.length}`);
  for (const q of quotations) {
    try {
      const r = await SalesOrderService.createFromWon({
        source: 'quotation',
        quotation: q,
        userId: null,
      });
      if (r) { created++; console.log(`   ✓ ${q.pqNumber} — ${q.client?.company}`); }
    } catch (e) {
      skipped++;
      console.log(`   ✗ ${q.pqNumber}: ${e.message}`);
    }
  }

  // ---- 2. Won Tenders ----
  console.log('\n─── 2. Won Tenders ───');
  const tenders = await Tender.find({ stage: 'won' }).lean();
  console.log(`   Found ${tenders.length}`);
  for (const t of tenders) {
    try {
      const r = await SalesOrderService.createFromWon({
        source: 'tender',
        tender: t,
        userId: null,
      });
      if (r) { created++; console.log(`   ✓ ${t.tenderer} — ${t.title}`); }
    } catch (e) {
      skipped++;
      console.log(`   ✗ ${t.tenderer}: ${e.message}`);
    }
  }

  // ---- 3. Won Forecast Entries ----
  console.log('\n─── 3. Won Forecast Entries ───');
  const forecasts = await ForecastEntry.find({ stage: 'won' }).lean();
  console.log(`   Found ${forecasts.length}`);
  for (const f of forecasts) {
    try {
      const r = await SalesOrderService.createFromWon({
        source: 'sales-crm',
        forecastEntry: f,
        userId: null,
      });
      if (r) { created++; console.log(`   ✓ ${f.client} — ${f.item}`); }
    } catch (e) {
      skipped++;
      console.log(`   ✗ ${f.client}: ${e.message}`);
    }
  }

  // ---- Summary ----
  const after = await SalesOrder.countDocuments();
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Orders BEFORE: ${before}`);
  console.log(`  Orders AFTER:  ${after}`);
  console.log(`  Net new:       ${after - before}`);
  console.log('═══════════════════════════════════════════════');
  console.log('\n✅ Backfill complete.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err);
  process.exit(1);
});