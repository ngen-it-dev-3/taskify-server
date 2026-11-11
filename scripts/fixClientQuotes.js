// scripts/fixClientQuotes.js
//
// Run:  node scripts/fixClientQuotes.js
//
// One-time repair: re-links every quotation to its matching client's
// embedded quotes[] array. Safe to run multiple times.

require('dotenv').config();
const mongoose = require('mongoose');

const Client = require('../src/models/Client.model');
const Quotation = require('../src/models/Quotation.model');

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  FIX CLIENT QUOTES');
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

  const quotations = await Quotation.find({}).lean();
  console.log(`📄 Found ${quotations.length} quotations\n`);

  let linked = 0;
  let skipped = 0;
  let noClient = 0;

  for (const q of quotations) {
    const company = q.client?.company;
    if (!company) { skipped++; continue; }

    const client = await Client.findOne({ nameKey: normalizeKey(company) });
    if (!client) {
      console.log(`   ⚠️  No client for "${company}" (qtn: ${q.pqNumber})`);
      noClient++;
      continue;
    }

    const alreadyLinked = (client.quotes || []).some(
      (existing) => existing.quotationId?.toString() === q._id.toString()
    );
    if (alreadyLinked) {
      console.log(`   · ${company} → ${q.pqNumber} (already linked)`);
      skipped++;
      continue;
    }

    const quoteEntry = {
      quotationId: q._id,
      qtnNumber: q.pqNumber || '',
      item: q.lines?.[0]?.name || `${q.lines?.length || 0} item(s)`,
      value: q.totals?.grandTotal || 0,
      status:
        q.status === 'sent' ? 'Sent' :
        q.status === 'won'  ? 'Won' :
        q.status === 'lost' ? 'Lost' :
        'Draft',
      date: q.createdAt || new Date(),
    };

    await Client.updateOne(
      { _id: client._id },
      {
        $push: { quotes: quoteEntry },
        $addToSet: { 'sourceRefs.quotationIds': q._id },
      }
    );

    console.log(`   ✓ ${company} → ${q.pqNumber} (৳${quoteEntry.value.toLocaleString()}) — ${quoteEntry.status}`);
    linked++;
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Linked:    ${linked}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  No client: ${noClient}`);
  console.log(`═══════════════════════════════════════════════`);
  console.log('\n✅ Done.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err);
  process.exit(1);
});