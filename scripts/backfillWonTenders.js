// scripts/backfillWonTenders.js
//
// Run:  node scripts/backfillWonTenders.js
//
// Creates ForecastEntry records for every existing Won tender.

require('dotenv').config();
const mongoose = require('mongoose');

const Tender = require('../src/models/Tender.model');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');
const { SalesCrmService } = require('../src/services/salesCrm/salesCrm.service');

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  BACKFILL WON TENDERS → FORECAST');
  console.log('═══════════════════════════════════════════════\n');

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) {
    console.error('❌ No MONGO_URI in .env');
    process.exit(1);
  }

  console.log('🔌 Connecting…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  const wonTenders = await Tender.find({ stage: 'won' }).lean();
  console.log(`Found ${wonTenders.length} Won tenders\n`);

  if (wonTenders.length === 0) {
    console.log('Nothing to do.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  let pushed = 0;
  let skipped = 0;

  for (const tender of wonTenders) {
    try {
      const result = await SalesCrmService.pushFromTender({
        tender,
        userId: null,
        userName: null,
      });

      if (result && result.id) {
        console.log(`   ✓ ${tender.title || tender.tenderer} → ৳${(result.value || 0).toLocaleString()}`);
        pushed++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.log(`   ✗ ${tender.title || tender.tenderer} — ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n   Pushed: ${pushed}, Skipped: ${skipped}`);

  const total = await ForecastEntry.countDocuments();
  const wonForecast = await ForecastEntry.countDocuments({ stage: 'won' });
  console.log(`\n📊 Total forecast entries: ${total}`);
  console.log(`📊 Won forecast entries: ${wonForecast}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ Done.');
  console.log('═══════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});