// scripts/update-user-names.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // নাম আপডেটের লিস্ট (BioID অনুযায়ী)
  const nameUpdates = [
    { bioId: "8", newName: "Sazeduzzaman Saju" },
    { bioId: "40", newName: "Shazidul Alam" }
  ];

  let updatedCount = 0;
  for (const update of nameUpdates) {
    const result = await User.updateOne(
      { biometricId: update.bioId },
      { $set: { fullName: update.newName } }
    );
    
    if (result.modifiedCount > 0) {
      updatedCount++;
      console.log(`✅ Updated BioID ${update.bioId}: ${update.newName}`);
    } else {
      console.log(`⚠️ BioID ${update.bioId} not found or name already correct.`);
    }
  }

  console.log(`\n🏁 Total Updated: ${updatedCount} users.\n`);

  // ✅ ফাইনাল ভেরিফিকেশন
  console.log("👥 Final Active Users List:");
  const users = await User.find({})
    .select("fullName email biometricId role")
    .sort({ biometricId: 1 });
    
  users.forEach(u => {
    console.log(`  [${u.biometricId || 'N/A'}] ${u.fullName} (${u.email}) - ${u.role}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})();