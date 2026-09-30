// scripts/deleteTestRecords.js
//
// Run once with:  node scripts/deleteTestRecords.js
//
// Deletes specific orphan test records from the ForecastEntry collection.

require('dotenv').config();

const mongoose = require('mongoose');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');

// ============================================================
// Records to delete (client name match + empty owner)
// ============================================================
const TEST_CLIENTS = [
  'asdasdasd',
  'asdadads',
  'asdasdasdasdasdads',
  'Sonali Bank PLC Test',
  'bigM',
];

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  DELETE TEST RECORDS');
  console.log('═══════════════════════════════════════════════\n');

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) {
    console.error('❌ No MongoDB connection string found.');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  // ----- Step 1: Show what will be deleted -----
  console.log('─── Records to be deleted ───');

  const matches = await ForecastEntry.find({
    owner: '',
    client: { $in: TEST_CLIENTS },
  })
    .select('_id client value stage month createdAt')
    .lean();

  if (matches.length === 0) {
    console.log('   ⚠️  No matching records found. Nothing to delete.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const m of matches) {
    console.log(
      `   · ${m.client.padEnd(28)} | ৳${String(m.value || 0).padStart(10)} | ${m.stage} | ${m.month}`
    );
  }

  console.log(`\n   Total: ${matches.length} records\n`);

  // ----- Step 2: Delete -----
  console.log('─── Deleting ───');

  const result = await ForecastEntry.deleteMany({
    owner: '',
    client: { $in: TEST_CLIENTS },
  });

  console.log(`   ✅ Deleted ${result.deletedCount} records\n`);

  // ----- Step 3: Verify -----
  console.log('─── Post-delete check ───');
  const remainingEmpty = await ForecastEntry.countDocuments({ owner: '' });
  console.log(`   Forecast entries with empty owner remaining: ${remainingEmpty}`);

  const stillThere = await ForecastEntry.find({
    client: { $in: TEST_CLIENTS },
  })
    .select('_id client owner')
    .lean();

  if (stillThere.length > 0) {
    console.log('\n   ⚠️  These matching records were NOT deleted (owner was not empty):');
    for (const r of stillThere) {
      console.log(`      · ${r.client} (owner: "${r.owner || '(blank)'}")`);
    }
  }

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