// scripts/inspectForecast.js
//
// Run:  node scripts/inspectForecast.js
//
// Reports what's in the ForecastEntry collection without needing Compass.

require('dotenv').config();

const mongoose = require('mongoose');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  FORECAST INSPECTOR');
  console.log('═══════════════════════════════════════════════\n');

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) {
    console.error('❌ No MongoDB connection string found in .env');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  // ---- Total count ----
  const total = await ForecastEntry.countDocuments();
  console.log(`📊 Total ForecastEntry records: ${total}\n`);

  if (total === 0) {
    console.log('⚠️  Collection is empty.\n');
    console.log('   → Send a new quotation to create one.');
    console.log('   → Check the backend log for "owner:" value.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ---- Group by owner ----
  console.log('─── Grouped by OWNER ───');
  const byOwner = await ForecastEntry.aggregate([
    {
      $group: {
        _id: { $ifNull: ['$owner', '(missing)'] },
        count: { $sum: 1 },
        total: { $sum: '$value' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  for (const row of byOwner) {
    const label = row._id === '' ? '(empty string)' : row._id;
    console.log(
      `   ${String(label).padEnd(30)} | ${String(row.count).padStart(3)} entries | ৳${row.total.toLocaleString()}`
    );
  }

  // ---- List all entries ----
  console.log('\n─── All entries (newest first) ───');

  const all = await ForecastEntry.find()
    .select('client value owner stage month pqNumber createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  console.log(
    `   ${'CLIENT'.padEnd(24)} | ${'VALUE'.padStart(12)} | ${'OWNER'.padEnd(20)} | STAGE       | MONTH`
  );
  console.log('   ' + '─'.repeat(100));

  for (const e of all) {
    const owner = e.owner && String(e.owner).trim() ? String(e.owner) : '(empty)';
    console.log(
      `   ${(e.client || '?').slice(0, 24).padEnd(24)} | ` +
      `৳${String(e.value || 0).padStart(11)} | ` +
      `${owner.slice(0, 20).padEnd(20)} | ` +
      `${(e.stage || '?').padEnd(11)} | ` +
      `${e.month || '?'}`
    );
  }

  // ---- Summary by stage ----
  console.log('\n─── Grouped by STAGE ───');
  const byStage = await ForecastEntry.aggregate([
    {
      $group: {
        _id: '$stage',
        count: { $sum: 1 },
        total: { $sum: '$value' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  for (const row of byStage) {
    console.log(
      `   ${String(row._id || '?').padEnd(15)} | ${String(row.count).padStart(3)} entries | ৳${row.total.toLocaleString()}`
    );
  }

  // ---- Empty owners check ----
  const emptyOwners = await ForecastEntry.countDocuments({
    $or: [{ owner: '' }, { owner: null }, { owner: { $exists: false } }],
  });

  console.log('\n─── Summary ───');
  console.log(`   Records with empty owner: ${emptyOwners}`);

  if (emptyOwners > 0) {
    console.log('\n   ⚠️  Run this to assign them:');
    console.log('       node scripts/backfillOwnerDefault.js');
    console.log('   (Make sure OWNER constant is set in that script.)');
  } else {
    console.log('   ✅ All records have an owner.');
  }

  console.log('\n═══════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});