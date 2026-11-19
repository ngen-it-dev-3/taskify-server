// scripts/clean-users.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected");

  // ⚠️ সতর্কতা: এই স্ক্রিপ্টটি শুধুমাত্র টেস্ট/ডেমো ইউজার ডিলিট করবে
  const patternsToDelete = [
    /demo/i, /test/i, /fake/i, /dummy/i, 
    "user@democorp.com", "admin@democorp.com", "doe@example.com"
  ];

  let deletedCount = 0;
  for (const pattern of patternsToDelete) {
    const result = await User.deleteMany({
      $or: [
        { fullName: { $regex: pattern } },
        { email: { $regex: pattern } },
        { employeeId: { $regex: pattern } }
      ]
    });
    deletedCount += result.deletedCount;
  }

  console.log(`🗑️ Deleted ${deletedCount} test/demo users.`);
  
  // বাকি ইউজারদের লিস্ট দেখুন যাতে নিশ্চিত হন সব ঠিক আছে
  const remaining = await User.find({}).select("fullName email biometricId");
  console.log("\n👥 Remaining Users:");
  remaining.forEach(u => console.log(`  - ${u.fullName} (${u.email}) [BioID: ${u.biometricId || 'None'}]`));

  await mongoose.disconnect();
  process.exit(0);
})();