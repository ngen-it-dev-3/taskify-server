// scripts/sync-now.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");

// ⭐ Load all dependent models so populate works properly
try {
  require("../src/models/User.model");
  require("../src/models/Attendance.model");

  try {
    require("../src/models/Department.model");
  } catch {
    console.log("⚠️ Department model not found. Skipping department populate.");
  }
} catch (err) {
  console.error("❌ Model loading error:", err.message);
  process.exit(1);
}

// Local YYYY-MM-DD helper (avoids UTC timezone shift)
const getLocalDateStr = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is missing in environment variables.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ DB connected\n");

    const { syncDeviceLogs } = require("../src/services/zkSyncService");
    if (typeof syncDeviceLogs !== "function") {
      throw new Error("syncDeviceLogs is not exported as a function from zkSyncService");
    }

    const todayStr = getLocalDateStr();
    console.log(`🔄 Starting Sync for Today (${todayStr})...`);

    // Pass both fromDate and date for compatibility with service signature
    const result = await syncDeviceLogs({
      fromDate: todayStr,
      date: todayStr,
    });

    console.log("\n📊 Result:", JSON.stringify(result ?? {}, null, 2));

    if (Array.isArray(result?.unmatched) && result.unmatched.length > 0) {
      console.log("\n⚠️ WARNING: These Device IDs are NOT mapped to any user:");
      console.log(result.unmatched);
      console.log("Please run 'node scripts/fix-biometric-ids.js' to fix them.");
    }
  } catch (err) {
    console.error("❌ Script Error:", err?.message || err);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(process.exitCode || 0);
  }
})();