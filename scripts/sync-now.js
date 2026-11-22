// scripts/sync-now.js
const mongoose = require("mongoose");
require("dotenv").config(); // .env load korar jonno
const { syncDeviceLogs } = require("../src/services/zkSyncService");

async function runSync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ DB connected\n");

    // ✅ FIX: Hardcode start date ba env theke nin
    const START_DATE = process.env.ZK_SYNC_START_DATE || "2026-11-19"; 
    const todayStr = new Date().toISOString().split('T')[0];

    console.log(`🔄 Starting Sync from ${START_DATE} to ${todayStr}...`);

    // ✅ FIX: fromDate pass kora hoyeche, ja service ke bole "ei tarikh er age r data ignore koro"
    const result = await syncDeviceLogs({
      fromDate: START_DATE, 
    });

    console.log("\n📊 Result:", JSON.stringify(result ?? {}, null, 2));

    if (Array.isArray(result?.unmatched) && result.unmatched.length > 0) {
      console.log("\n⚠️ WARNING: Unmapped IDs:", result.unmatched);
      console.log("Please run 'node scripts/fix-biometric-ids.js' to fix them.");
    }

  } catch (err) {
    console.error("❌ Script Error:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Done.");
  }
}

runSync();