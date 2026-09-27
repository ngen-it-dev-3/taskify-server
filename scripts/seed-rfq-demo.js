// scripts/seed-rfq-demo.js
// ============================================================
// Seeder for RFQ demo data
// Usage:
//   node scripts/seed-rfq-demo.js
//   node scripts/seed-rfq-demo.js --reset   (delete existing first)
//   node scripts/seed-rfq-demo.js --count=25
// ============================================================

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// ---- Load env ----
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ---- Import models ----
const RFQ = require('../src/models/rfq/RFQ');
const Counter = require('../src/models/rfq/Counter');

// ============================================================
// DATA BANKS
// ============================================================
const COMPANIES = [
  { name: 'NGEN IT PTE. LTD.', country: 'Singapore', contact: 'ADAN MAHMUD', email: 'sales@ngenitltd.com', phone: '01714243446' },
  { name: 'Everyonic Technology', country: 'Pakistan', contact: 'Tariq Mehmood', email: 'tariq@everyonic.pk', phone: '+92 300 1234567' },
  { name: 'MAV SZK Zrt.', country: 'Hungary', contact: 'Zoltán Kovács', email: 'kovacs.z@mavszk.hu', phone: '+36 1 456 7890' },
  { name: 'NGEN IT', country: 'Bangladesh', contact: 'Kazi Farhan', email: 'farhan.k@ngenit.com', phone: '01819223344' },
  { name: 'O3 Capital Finance Company Limited', country: 'Nigeria', contact: 'Babatunde Adeleke', email: 'badeleke@o3capitalng.com', phone: '+234 1 270 1234' },
  { name: 'Meridian Port Authority', country: 'United States of America', contact: 'Robert Vance', email: 'rvance@meridianport.gov', phone: '+1 206 555 0192' },
  { name: 'Ganges Freight Pvt. Ltd.', country: 'India', contact: 'Anil Deshmukh', email: 'anil@gangesfreight.in', phone: '+91 22 2345 6789' },
  { name: 'Delta Steelworks Ltd.', country: 'Bangladesh', contact: 'Mustafa Kamal', email: 'kamal@deltasteel.com.bd', phone: '01711998877' },
  { name: 'Grameenphone Ltd.', country: 'Bangladesh', contact: 'Tanvir Ahmed', email: 'procurement@grameenphone.com', phone: '01711122334' },
  { name: 'Singtel Enterprise', country: 'Singapore', contact: 'Wei Ling Tan', email: 'wtan@singtel.com.sg', phone: '+65 6838 3388' },
  { name: 'Lahore Logistics', country: 'Pakistan', contact: 'Adnan Iqbal', email: 'adnan@lahorelogistics.pk', phone: '+92 42 3567890' },
  { name: 'Budapest Data Center Kft.', country: 'Hungary', contact: 'Gábor Szabó', email: 'gszabo@bdc.hu', phone: '+36 1 700 1200' },
  { name: 'Lagos Fintech Hub', country: 'Nigeria', contact: 'Chioma Okonkwo', email: 'chioma@lagosfintech.ng', phone: '+234 803 555 0199' },
  { name: 'Infosys Technologies', country: 'India', contact: 'Priya Sharma', email: 'priya.sharma@infosys.com', phone: '+91 80 2852 0261' },
  { name: 'Bangladesh Railway', country: 'Bangladesh', contact: 'Sohail Rana', email: 'sohail@railway.gov.bd', phone: '0255666677' },
];

const PRODUCT_BANK = [
  { name: 'Acronis Access — subscription license renewal (1 year) — 1 user', spec: 'Enterprise Access Subscription renewal with 12 months standard SLA support', brand: 'Acronis', sku: 'ACR-ACC-1Y-1U', modelNo: 'ACC-2026' },
  { name: 'Industrial Ethernet Switch 16-Port Managed', spec: 'Ruggedized DIN-rail switch, dual power input', brand: 'Advantech', sku: 'EKI-7716G', modelNo: '7716G' },
  { name: 'Balluff Inductive Sensors Pack BES M18', spec: 'M18x1 shielded inductive proximity switches', brand: 'Balluff', sku: 'BES-M18-PK', modelNo: 'M18' },
  { name: 'Fortinet FortiGate 60F Firewall & UTM Bundle', spec: '1-Year 24x7 FortiCare and FortiGuard Unified Threat Protection', brand: 'Fortinet', sku: 'FG-60F-BDL', modelNo: 'FG-60F' },
  { name: 'Radmin Server & Viewer Perpetual Licenses (50 Pack)', spec: 'Commercial enterprise bulk license key', brand: 'Radmin', sku: 'RDM-50PK', modelNo: '50-PACK' },
  { name: 'Zebra RFID Fixed Readers & Antennas', spec: 'FX9600 4-Port Long Range Integrated RFID System', brand: 'Zebra', sku: 'FX9600', modelNo: 'FX9600' },
  { name: 'Advantech Industrial Gateway Modules', spec: 'DIN-rail communication gateways', brand: 'Advantech', sku: 'ADV-GW-MOD', modelNo: 'GW' },
  { name: 'Emerson Pressure Sensors & Transmitters', spec: 'High precision industrial pressure measurement transmitters', brand: 'Emerson', sku: 'EMR-PT-100', modelNo: 'PT-100' },
  { name: 'Cisco Catalyst 9200 Series Switch', spec: '24-Port PoE+ Managed Switch, 4x 10G SFP+ Uplinks', brand: 'Cisco', sku: 'C9200-24P', modelNo: 'C9200' },
  { name: 'APC Smart-UPS 3000VA Rack Mount', spec: '2U Rack-mount UPS with Network Management Card', brand: 'APC', sku: 'SMT3000RMI2U', modelNo: 'SMT3000' },
  { name: 'Dell PowerEdge R750 Rack Server', spec: '2x Intel Xeon Silver, 128GB RAM, 4x 960GB SSD', brand: 'Dell', sku: 'PER750', modelNo: 'R750' },
  { name: 'Hikvision 4MP IP Bullet Camera', spec: 'Outdoor IR bullet camera with 30m range, IP67', brand: 'Hikvision', sku: 'DS-2CD2043G2', modelNo: '2043G2' },
  { name: 'Synology DiskStation DS1621+ NAS', spec: '6-bay NAS, AMD Ryzen, 4GB RAM expandable', brand: 'Synology', sku: 'DS1621+', modelNo: 'DS1621' },
  { name: 'Microsoft 365 Business Premium', spec: 'Annual subscription, 300 user seats', brand: 'Microsoft', sku: 'M365-BP-YR', modelNo: 'M365BP' },
  { name: 'Sophos XG 135 Firewall', spec: 'Next-gen firewall with sandboxing and 3-year subscription', brand: 'Sophos', sku: 'XG135', modelNo: 'XG-135' },
];

const SALESMEN = ['Nahid Hasan', 'Akramul', 'CRM Manager, ME', 'Wei Ling Tan', 'Unassigned'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STAGES = ['pending', 'pending', 'pending', 'quoted', 'quoted', 'archived']; // weighted
const RECEIVED_VIA = ['Email', 'Phone', 'WhatsApp', 'In-Person'];
const PROJECT_STATUS = ['Planning', 'Budgeting', 'Approved', 'In Progress', 'On Hold'];
const PURCHASE_WINDOWS = ['Within 1 month', '1–3 months', '3–6 months', '6+ months'];

// ============================================================
// HELPERS
// ============================================================
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Weighted pick — earlier indices more likely
function weightedPick(arr) {
  const idx = Math.floor(Math.pow(Math.random(), 1.6) * arr.length);
  return arr[idx];
}

// Build RFQ number (YYMMDD-seq)
async function nextRfqNumber(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const key = `rfq-${yy}${mm}${dd}`;

  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${yy}${mm}${dd}-${counter.seq}`;
}

// Build products array (1–3 items)
function buildProducts() {
  const n = randInt(1, 3);
  const chosen = pickN(PRODUCT_BANK, n);
  return chosen.map((p, i) => ({
    sl: i + 1,
    name: p.name,
    qty: randInt(1, 12),
    spec: p.spec,
    sku: p.sku,
    modelNo: p.modelNo,
    brand: p.brand,
    description: p.spec,
    additionalInfo: '',
    files: [],
  }));
}

// Pick a random past date within N days
function randomPastDate(maxDaysAgo) {
  const now = Date.now();
  const offset = randInt(0, maxDaysAgo) * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(d) {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================
// BUILD ONE RFQ DOC
// ============================================================
async function buildRfq(index) {
  const company = COMPANIES[index % COMPANIES.length];
  const createdAt = randomPastDate(60);
  const stage = weightedPick(STAGES);
  const salesman = pick(SALESMEN);
  const assignedTo = salesman === 'Unassigned' ? 'Unassigned' : salesman;

  const rfqNumber = await nextRfqNumber(createdAt);
  const products = buildProducts();

  // Randomize budget by product count
  const budgetBase = products.reduce((s, p) => s + p.qty, 0);
  const currency = company.country === 'Bangladesh' ? '৳'
    : company.country === 'India' ? '₹'
    : company.country === 'Hungary' ? '€'
    : '$';
  const tentativeBudget =
    Math.random() > 0.2
      ? `${currency}${(budgetBase * randInt(300, 2500)).toLocaleString()}`
      : '';

  const purchaseDate =
    stage === 'quoted' || Math.random() > 0.5
      ? formatDate(new Date(Date.now() + randInt(7, 90) * 24 * 60 * 60 * 1000))
      : '';

  return {
    rfqNumber,
    source: Math.random() > 0.3 ? 'online' : 'manual',
    company: company.name,
    country: company.country,
    date: formatDate(createdAt),
    time: formatTime(createdAt),
    agingDays: Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    stage,
    priority: pick(PRIORITIES),
    salesman: assignedTo,
    assignedTo,
    receivedVia: pick(RECEIVED_VIA),

    contactName: company.contact,
    email: company.email,
    phone: company.phone,
    designation: pick(['Admin', 'Procurement Officer', 'IT Manager', 'Sales Manager', 'Operations Head']),
    address: `${randInt(1, 999)}, ${pick(['Anson Road', 'Main Street', 'Industrial Ave', 'Business Park', 'Tech Hub'])}`,
    city: company.country,
    zipCode: String(randInt(100000, 999999)),
    isReseller: Math.random() > 0.7,

    projectName: Math.random() > 0.5 ? `${company.name} Network Upgrade` : '',
    tentativeBudget,
    currentProjectStatus: pick(PROJECT_STATUS),
    tentativePurchaseDate: purchaseDate,
    comment: Math.random() > 0.6 ? 'Client requested pricing by end of month.' : '',

    products,

    assignmentHistory:
      assignedTo !== 'Unassigned'
        ? [{
            assignedTo,
            assignedAt: new Date(createdAt.getTime() + 3600 * 1000),
            notes: 'Initial assignment',
          }]
        : [],

    createdAt,
    updatedAt: createdAt,
  };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 15;

  console.log('\n🌱 RFQ Demo Seeder');
  console.log('═══════════════════════════════════════');

  // ---- Connect ----
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI missing in .env');
    process.exit(1);
  }

  console.log(`📡 Connecting to MongoDB…`);
  await mongoose.connect(uri);
  console.log('✅ Connected');

  // ---- Optional reset ----
  if (reset) {
    const delRfqs = await RFQ.deleteMany({});
    const delCounters = await Counter.deleteMany({ _id: /^rfq-/ });
    console.log(`🗑  Deleted ${delRfqs.deletedCount} RFQs`);
    console.log(`🗑  Deleted ${delCounters.deletedCount} counters`);
  }

  // ---- Build ----
  console.log(`\n⚙️  Generating ${count} RFQs…`);
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push(await buildRfq(i));
  }

  // ---- Insert ----
  const inserted = await RFQ.insertMany(docs, { ordered: false });
  console.log(`✅ Inserted ${inserted.length} RFQs\n`);

  // ---- Summary ----
  const summary = await RFQ.aggregate([
    { $group: { _id: '$stage', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log('📊 Summary by stage:');
  summary.forEach((s) => console.log(`   • ${s._id.padEnd(10)} ${s.count}`));

  const byCountry = await RFQ.aggregate([
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  console.log('\n🌍 Top 5 countries:');
  byCountry.forEach((c) => console.log(`   • ${c._id.padEnd(30)} ${c.count}`));

  console.log('\n═══════════════════════════════════════');
  console.log('✨ Done! Open http://localhost:3000/crm/rfq');
  console.log('═══════════════════════════════════════\n');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Seeder failed:', err);
  process.exit(1);
});