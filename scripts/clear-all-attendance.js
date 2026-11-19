// scripts/clear-all-attendance.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { Attendance } = require("../src/models/Attendance.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // ১. আগে কাউন্ট দেখে নেওয়া যাক কতগুলো ডাটা আছে
  const countBefore = await Attendance.countDocuments();
  console.log(`📊 Current Attendance Records: ${countBefore}`);

  if (countBefore === 0) {
    console.log("✨ Collection is already empty!");
  } else {
    // ২. সব ডাটা ডিলিট করা
    console.log("🗑️ Deleting all attendance records...");
    await Attendance.deleteMany({});
    
    // ৩. নিশ্চিত হওয়া যে সব মুছে গেছে
    const countAfter = await Attendance.countDocuments();
    console.log(`✅ Deletion Complete. Remaining Records: ${countAfter}`);
  }

  console.log("\n💡 Next Step: Run 'node scripts/sync-now.js' to fetch fresh data from device.");

  await mongoose.disconnect();
  process.exit(0);
})();