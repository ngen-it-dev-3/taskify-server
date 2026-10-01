// scripts/seedDmar.js
//
// Run:  node scripts/seedDmar.js
//
// Populates the DMAR collection with realistic demo data:
//   - ~40 activities across Oct + Sep 2025
//   - Various activity types (Visited, Called, Emailed, Posted, Social, Meeting)
//   - Multiple sectors, teams, and marketing team members
//   - Monthly plan for Oct 2025

require('dotenv').config();

const mongoose = require('mongoose');
const DmarActivity = require('../src/models/dmar/DmarActivity.model');
const DmarSettings = require('../src/models/dmar/DmarSettings.model');
const { User } = require('../src/models/User.model');

// ============================================================
// HELPERS
// ============================================================
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  return new Date(Date.now() - n * DAY_MS);
}

// ============================================================
// SEED DATA
// ============================================================
async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  DMAR SEED');
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

  // ---- Find a user to attribute activities to ----
  const users = await User.find({}).limit(5).lean();
  if (users.length === 0) {
    console.error('❌ No users found. Create at least one user first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`👥 Found ${users.length} users:`);
  users.forEach((u) => console.log(`   · ${u.fullName} (${u.email})`));

  // Pick up to 3 users as loggers
  const loggers = users.slice(0, 3);

  function pickLogger(i) {
    const u = loggers[i % loggers.length];
    return {
      id: u._id,
      name: u.fullName || u.name || u.email || 'Unknown',
    };
  }

  // ---- Clear existing DMAR data ----
  console.log('\n🗑️  Clearing existing DMAR data…');
  await DmarActivity.deleteMany({});
  await DmarSettings.deleteMany({});
  console.log('✅ Cleared\n');

  // ---- Activity seeds ----
  const seedActivities = [
    // ============ OCT 2025 ============
    { days: 0,  type: 'Visited', company: 'AKH Diagnostics',      product: 'Laboratory',                        client: 'New',      team: 'Marketing', sector: 'Government',      area: 'Sher-E-Bangla Nagar', value: null, status: 'To Start' },
    { days: 1,  type: 'Visited', company: 'Renata Limited',        product: 'Miscellaneous',                     client: 'New',      team: 'Marketing', sector: 'Small & Medium',  area: 'Sher-E-Bangla Nagar', value: null, status: 'To Start' },
    { days: 2,  type: 'Visited', company: 'WASA',                  product: 'P+F, Honeywell, Krohne, Emerson',   client: 'New',      team: 'Marketing', sector: 'NGOs',            area: 'Baitul Aman Housing', value: null, status: 'To Start' },
    { days: 3,  type: 'Visited', company: 'BCIC',                  product: 'Tender',                            client: 'New',      team: 'Marketing', sector: 'Government',      area: 'Motijheel',           value: null, status: 'To Start' },
    { days: 4,  type: 'Visited', company: 'Dhaka Pani Bhaban',     product: 'Flow Meter',                        client: 'New',      team: 'Marketing', sector: 'Education',       area: 'Motijheel',           value: null, status: 'To Start' },
    { days: 5,  type: 'Called',  company: 'Powerpack',             product: 'SEL, Emerson',                      client: 'Existing', team: 'Marketing', sector: 'Health Care',     area: 'Mohakhali',           value: null, status: 'To Start' },
    { days: 6,  type: 'Emailed', company: 'NBBL',                  product: 'P+F, Honeywell, Krohne, Emerson+3M', client: 'Existing', team: 'Marketing', sector: 'Banks',          area: 'Panthapath',          value: 420000, status: 'Quoted' },
    { days: 7,  type: 'Visited', company: 'Beximco Pharma',        product: 'Instrumentation',                   client: 'New',      team: 'Marketing', sector: 'Health Care',     area: 'Tongi',               value: null, status: 'To Start' },
    { days: 8,  type: 'Called',  company: 'Grameenphone',          product: 'Network Equipment',                 client: 'Existing', team: 'Sales',     sector: 'Telcos',          area: 'Bashundhara',         value: 1200000, status: 'Quoted' },
    { days: 9,  type: 'Emailed', company: 'Bashundhara Group',     product: 'Industrial Automation',             client: 'New',      team: 'Sales',     sector: 'Group of Companies', area: 'Bashundhara',      value: 850000, status: 'Quoted' },
    { days: 10, type: 'Posted',  company: 'Brac Bank',             product: 'Brochure drop',                     client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Gulshan',             value: null, status: 'To Start' },
    { days: 11, type: 'Visited', company: 'Square Hospital',       product: 'Medical Devices',                   client: 'New',      team: 'Sales',     sector: 'Health Care',     area: 'Panthapath',          value: 2500000, status: 'Quoted' },
    { days: 12, type: 'Meeting', company: 'Akij Group',            product: 'Process Control',                   client: 'Existing', team: 'Sales',     sector: 'Group of Companies', area: 'Tejgaon',         value: 3200000, status: 'Quoted' },
    { days: 13, type: 'Social',  company: 'City Bank',             product: 'LinkedIn outreach',                 client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Gulshan',             value: null, status: 'To Start' },
    { days: 14, type: 'Called',  company: 'Walton',                product: 'PLC systems',                       client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Chandra',             value: 780000, status: 'Quoted' },
    { days: 15, type: 'Visited', company: 'DESCO',                 product: 'SCADA',                             client: 'New',      team: 'Sales',     sector: 'Government',      area: 'Dilkusha',            value: null, status: 'To Start' },
    { days: 16, type: 'Emailed', company: 'Berger Paints',         product: 'Chemical sensors',                  client: 'Existing', team: 'Sales',     sector: 'Manufacturers',   area: 'Savar',               value: 450000, status: 'Quoted' },
    { days: 17, type: 'Visited', company: 'Knit Concern',          product: 'Dyeing control',                    client: 'New',      team: 'Sales',     sector: 'Garments & Buying', area: 'Gazipur',           value: 620000, status: 'Quoted' },
    { days: 18, type: 'Called',  company: 'Bashundhara Cement',    product: 'Weighing systems',                  client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Munshiganj',          value: 320000, status: 'Quoted' },
    { days: 19, type: 'Posted',  company: 'IFIC Bank',             product: 'Product catalog',                   client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Motijheel',           value: null, status: 'To Start' },

    // ============ SEP 2025 ============
    { days: 32, type: 'Visited', company: 'Sonali Bank',           product: 'Kiosk systems',                     client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Motijheel',           value: 350000, status: 'Quoted' },
    { days: 34, type: 'Emailed', company: 'Janata Bank',           product: 'ATMs',                              client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Motijheel',           value: null, status: 'To Start' },
    { days: 36, type: 'Visited', company: 'Rupali Bank',           product: 'Networking',                        client: 'New',      team: 'Marketing', sector: 'Banks',           area: 'Motijheel',           value: 280000, status: 'Quoted' },
    { days: 38, type: 'Called',  company: 'Bangladesh Bank',       product: 'Security systems',                  client: 'Existing', team: 'Marketing', sector: 'Government',      area: 'Motijheel',           value: null, status: 'To Start' },
    { days: 40, type: 'Meeting', company: 'Gulshan Club',          product: 'Facility automation',               client: 'New',      team: 'Sales',     sector: 'Enterprises',     area: 'Gulshan',             value: 950000, status: 'Quoted' },
    { days: 42, type: 'Visited', company: 'Dhaka University',      product: 'Lab equipment',                     client: 'New',      team: 'Marketing', sector: 'Education',       area: 'Nilkhet',             value: 180000, status: 'Quoted' },
    { days: 44, type: 'Emailed', company: 'BUET',                  product: 'Research instruments',              client: 'New',      team: 'Marketing', sector: 'Education',       area: 'Palashi',             value: 220000, status: 'Quoted' },
    { days: 46, type: 'Visited', company: 'Square Textiles',       product: 'Spinning control',                  client: 'Existing', team: 'Sales',     sector: 'Garments & Buying', area: 'Gazipur',           value: 1400000, status: 'Quoted' },
    { days: 48, type: 'Called',  company: 'DBL Group',             product: 'Quality control',                   client: 'New',      team: 'Sales',     sector: 'Garments & Buying', area: 'Kashimpur',         value: 890000, status: 'Quoted' },
    { days: 50, type: 'Posted',  company: 'BRAC',                  product: 'NGO partnership',                   client: 'New',      team: 'Marketing', sector: 'NGOs',            area: 'Mohakhali',           value: null, status: 'To Start' },

    // ============ AUG 2025 ============
    { days: 60, type: 'Visited', company: 'Coca-Cola Bangladesh',  product: 'Bottling automation',               client: 'Existing', team: 'Sales',     sector: 'Manufacturers',   area: 'Dhaka EPZ',           value: 2100000, status: 'Quoted' },
    { days: 63, type: 'Emailed', company: 'Unilever Bangladesh',   product: 'Supply chain systems',              client: 'Existing', team: 'Sales',     sector: 'Manufacturers',   area: 'Gulshan',             value: 1650000, status: 'Sold' },
    { days: 66, type: 'Meeting', company: 'LafargeHolcim',         product: 'Plant monitoring',                  client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Munshiganj',          value: 3400000, status: 'Quoted' },
    { days: 69, type: 'Called',  company: 'Pran-RFL Group',        product: 'Food processing',                   client: 'New',      team: 'Sales',     sector: 'Group of Companies', area: 'Narayanganj',      value: 980000, status: 'Quoted' },
    { days: 72, type: 'Visited', company: 'ACI Limited',           product: 'Agro tech',                         client: 'Existing', team: 'Sales',     sector: 'Group of Companies', area: 'Tejgaon',          value: 1520000, status: 'Quoted' },
    { days: 75, type: 'Emailed', company: 'Bata Bangladesh',       product: 'Manufacturing line',                client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Tongi',               value: 620000, status: 'Quoted' },
    { days: 78, type: 'Visited', company: 'Bashundhara Paper',     product: 'Pulp control',                      client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Bashundhara',         value: 780000, status: 'Quoted' },
    { days: 81, type: 'Called',  company: 'Akij Jute Mills',       product: 'Jute processing',                   client: 'New',      team: 'Sales',     sector: 'Manufacturers',   area: 'Narsingdi',           value: 410000, status: 'Lost' },
    { days: 84, type: 'Posted',  company: 'Renata Agro',           product: 'Poster campaign',                   client: 'New',      team: 'Marketing', sector: 'Small & Medium',  area: 'Gazipur',             value: null, status: 'To Start' },
    { days: 87, type: 'Social',  company: 'PRAN Beverage',         product: 'LinkedIn outreach',                 client: 'New',      team: 'Marketing', sector: 'Group of Companies', area: 'Narayanganj',      value: null, status: 'To Start' },
  ];

  // ---- Insert activities ----
  console.log(`📝 Inserting ${seedActivities.length} activities…\n`);

  let inserted = 0;
  for (let i = 0; i < seedActivities.length; i++) {
    const s = seedActivities[i];
    const logger = pickLogger(i);

    const doc = new DmarActivity({
      date: daysAgo(s.days),
      activityType: s.type,
      company: s.company,
      clientType: s.client,
      product: s.product,
      team: s.team,
      sector: s.sector,
      area: s.area,
      value: s.value,
      status: s.status,
      notes: `Demo activity logged by ${logger.name}`,
      followUpDate: s.type === 'Visited' ? daysAgo(s.days - 7) : null,
      source: 'manual',
      loggedBy: logger.id,
      loggedByName: logger.name,
      createdBy: logger.id,
    });

    await doc.save();
    inserted++;
    console.log(
      `   ✓ [${s.team.substring(0, 3)}] ${s.type.padEnd(8)} | ${s.company.padEnd(28)} | ${s.sector}`
    );
  }

  console.log(`\n✅ Inserted ${inserted} activities\n`);

  // ---- Monthly plan for Oct 2025 ----
  console.log('📋 Creating monthly plan for Oct 2025…');

  const currentYear = new Date().getFullYear();
  const currentMonth = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][new Date().getMonth()];

  const settings = await DmarSettings.findOneAndUpdate(
    { year: currentYear, month: currentMonth, team: 'Both' },
    {
      $set: {
        year: currentYear,
        month: currentMonth,
        team: 'Both',
        salesTarget: 3000000,
        plan: [
          { key: 'Site Visit', planned: 23 },
          { key: 'Client Visit', planned: 1 },
          { key: 'Telephone', planned: 90 },
          { key: 'Email', planned: 81 },
          { key: 'Social', planned: 1 },
        ],
        updatedBy: loggers[0]._id,
      },
    },
    { new: true, upsert: true }
  );

  console.log(`✅ Plan saved for ${currentMonth} ${currentYear}`);
  console.log(`   Sales target: ৳${settings.salesTarget.toLocaleString()}`);
  settings.plan.forEach((p) => {
    console.log(`   · ${p.key.padEnd(15)} → ${p.planned} planned`);
  });

  // ---- Summary ----
  const total = await DmarActivity.countDocuments();
  const visited = await DmarActivity.countDocuments({ activityType: 'Visited' });
  const quoted = await DmarActivity.countDocuments({ status: 'Quoted' });
  const sold = await DmarActivity.countDocuments({ status: 'Sold' });

  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total activities:   ${total}`);
  console.log(`  Visited:            ${visited}`);
  console.log(`  Quoted:             ${quoted}`);
  console.log(`  Sold:               ${sold}`);
  console.log('═══════════════════════════════════════════════');
  console.log('\n✅ DMAR seed complete.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});