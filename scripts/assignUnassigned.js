// scripts/assignUnassigned.js
//
// Run:  node scripts/assignUnassigned.js
//
// Replaces the literal string "Unassigned" in the owner field
// with a real salesperson name.

require('dotenv').config();

const mongoose = require('mongoose');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');

// ============================================================
// ⭐ CONFIGURE HERE
// ============================================================
const NEW_OWNER = 'Shazidul Alam';   // ← change to whoever should own these
// ============================================================

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  ASSIGN UNASSIGNED → REAL OWNER');
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

  console.log(`👤 New owner: "${NEW_OWNER}"\n`);
  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  // ---- Find records with literal "Unassigned" (case-insensitive) ----
  const UNASSIGNED_REGEX = /^unassigned$/i;

  const matches = await ForecastEntry.find({
    owner: { $regex: UNASSIGNED_REGEX },
  })
    .select('_id client value stage month owner')
    .lean();

  if (matches.length === 0) {
    console.log('   ⚠️  No records with "Unassigned" as owner. Nothing to do.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`─── Found ${matches.length} records ───\n`);
  for (const m of matches) {
    console.log(
      `   · ${(m.client || '?').padEnd(28)} | ৳${String(m.value || 0).padStart(10)} | ${m.stage} | ${m.month}`
    );
  }

  console.log('\n─── Updating ───\n');

  const result = await ForecastEntry.updateMany(
    { owner: { $regex: UNASSIGNED_REGEX } },
    { $set: { owner: NEW_OWNER } }
  );

  console.log(`   ✅ Updated ${result.modifiedCount} records\n`);

  // ---- Verify ----
  const byOwner = await ForecastEntry.aggregate([
    { $group: { _id: '$owner', count: { $sum: 1 }, total: { $sum: '$value' } } },
    { $sort: { total: -1 } },
  ]);

  console.log('─── New ownership summary ───');
  for (const row of byOwner) {
    console.log(
      `   ${String(row._id || '(blank)').padEnd(30)} | ${String(row.count).padStart(3)} entries | ৳${row.total.toLocaleString()}`
    );
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