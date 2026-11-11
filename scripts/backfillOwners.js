// scripts/deleteEmptyOwnerEntries.js
//
// Run:  node scripts/deleteEmptyOwnerEntries.js

require('dotenv').config();

const mongoose = require('mongoose');
const ForecastEntry = require('../src/models/salesCrm/Forecast.model');

async function main() {
    const uri =
        process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        process.env.DB_URI;

    if (!uri) { console.error('❌ No MONGO_URI'); process.exit(1); }

    console.log('🔌 Connecting…');
    await mongoose.connect(uri);
    console.log('✅ Connected\n');

    const matches = await ForecastEntry.find({
        $or: [{ owner: '' }, { owner: null }, { owner: { $exists: false } }],
    })
        .select('_id client value')
        .lean();

    console.log(`Found ${matches.length} records with empty owner:\n`);
    for (const m of matches) {
        console.log(`   · ${m.client} (৳${m.value})`);
    }

    if (matches.length === 0) {
        console.log('\n✅ Nothing to delete.\n');
        await mongoose.disconnect();
        process.exit(0);
    }

    const result = await ForecastEntry.deleteMany({
        $or: [{ owner: '' }, { owner: null }, { owner: { $exists: false } }],
    });

    console.log(`\n✅ Deleted ${result.deletedCount} records.\n`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});