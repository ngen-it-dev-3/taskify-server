// scripts/import-users-from-device.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const ZKLib = require("zkteco-js");
const { User } = require("../src/models/User.model");

const DEVICE_IP = process.env.ZK_DEVICE_IP || "192.168.1.201";
const DEVICE_PORT = Number(process.env.ZK_DEVICE_PORT || 4370);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);
  
  try {
    await zk.createSocket();
    console.log(`🔌 Connected to Device: ${DEVICE_IP}`);

    // ১. ডিভাইস থেকে সব ইউজার আনা
    const { data: deviceUsers } = await zk.getUsers();
    console.log(`📥 Fetched ${deviceUsers.length} users from device.\n`);

    let created = 0;
    let skipped = 0;

    for (const du of deviceUsers) {
      // Master Card বা খালি নাম স্কিপ করা
      if (!du.name || du.name.toLowerCase().includes('master')) continue;

      // ২. চেক করা এই BioID দিয়ে কেউ আগে থেকেই আছে কিনা
      const existing = await User.findOne({ biometricId: String(du.uid) });
      
      if (existing) {
        skipped++;
        continue;
      }

      // ৩. নতুন ইউজার তৈরি করা
      // ইমেইল না থাকলে একটি প্লেসহোল্ডার ইমেইল জেনারেট করা হচ্ছে
      const placeholderEmail = `user${du.uid}@ngenitltd.com`; 
      
      await User.create({
        fullName: du.name,
        email: placeholderEmail, // HR পরে এডিট করে রিয়েল ইমেইল বসাতে পারবে
        password: "TempPass@123", // পরে রিসেট করতে হবে
        biometricId: String(du.uid),
        role: "employee",
        isActive: true
      });
      
      created++;
      console.log(`✅ Created: [${du.uid}] ${du.name}`);
    }

    console.log(`\n🏁 Import Complete: ${created} created, ${skipped} skipped.`);

    // ৪. ফাইনাল লিস্ট দেখানো
    console.log("\n👥 All Users in DB now:");
    const allUsers = await User.find({}).select("fullName email biometricId role").sort({ biometricId: 1 });
    allUsers.forEach(u => {
      console.log(`  [${u.biometricId || 'N/A'}] ${u.fullName} (${u.email}) - ${u.role}`);
    });

    await zk.disconnect();
  } catch (err) {
    console.error("❌ Error:", err.message);
    try { await zk.disconnect(); } catch {}
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();