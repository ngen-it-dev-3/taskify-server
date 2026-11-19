// scripts/fix-biometric-ids.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // ⚠️ এই ম্যাপিংটি আপনার ডিভাইসের User ID অনুযায়ী
  const idFixes = [
    { oldBioId: "8", newBioId: "112", name: "Sazeduzzaman Saju" },
    { oldBioId: "10", newBioId: "114", name: "Kazi Akramul Arefin" },
    { oldBioId: "40", newBioId: "136", name: "Shazidul Alam" },
    // Minhajul Islam (111) ডিলিট করা ছিল, তাই এখানে নেই। 
  ];

  let updatedCount = 0;
  for (const fix of idFixes) {
    const result = await User.updateOne(
      { biometricId: fix.oldBioId },
      { $set: { biometricId: fix.newBioId } }
    );
    
    if (result.modifiedCount > 0) {
      updatedCount++;
      console.log(`✅ Fixed ${fix.name}: ${fix.oldBioId} → ${fix.newBioId}`);
    } else {
      console.log(`⚠️ Could not find user with old BioID: ${fix.oldBioId}`);
    }
  }

  console.log(`\n🏁 Total IDs Fixed: ${updatedCount}\n`);

  // ✅ Verification
  console.log("👥 Current Active Users & BioIDs:");
  const users = await User.find({ biometricId: { $ne: null } })
    .select("fullName biometricId")
    .sort({ biometricId: 1 });
    
  users.forEach(u => {
    console.log(`  [${u.biometricId}] ${u.fullName}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})();