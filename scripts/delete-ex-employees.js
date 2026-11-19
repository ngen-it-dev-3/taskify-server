// scripts/delete-ex-employees.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // যেসব BioID ডিলিট করতে হবে
  const bioIdsToDelete = ["27", "29", "31", "33", "36", "38"];

  let deletedCount = 0;
  for (const id of bioIdsToDelete) {
    const result = await User.deleteOne({ biometricId: id });
    if (result.deletedCount > 0) {
      deletedCount++;
      console.log(`🗑️ Deleted BioID ${id}`);
    } else {
      console.log(`⚠️ BioID ${id} not found.`);
    }
  }

  console.log(`\n🏁 Total Deleted: ${deletedCount} ex-employees.\n`);

  // ✅ Verification: বর্তমান লিস্ট
  console.log("👥 Remaining Active Users in DB:");
  const users = await User.find({})
    .select("fullName email biometricId role")
    .sort({ biometricId: 1 });
    
  users.forEach(u => {
    console.log(`  [${u.biometricId || 'N/A'}] ${u.fullName} (${u.email}) - ${u.role}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})();