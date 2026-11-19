// scripts/final-cleanup.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // ১. যেসব ডোমেইন থেকে আমরা নিশ্চিত যে এগুলো ফেক/টেস্ট
  const fakeDomains = ["mailinator.com", "example.com", "democorp.com"];
  
  // ২. যেসব নাম থেকে আমরা নিশ্চিত যে এগুলো ফেক
  const fakeNames = ["mike tyson", "john cena", "demo user", "test admin", "labore ipsum", "enim quibusdam", "fytfyf"];

  let totalDeleted = 0;

  // --- মুছে ফেলা লজিক ---
  
  // A. ফেক ডোমেইন দিয়ে খোঁজা
  for (const domain of fakeDomains) {
    const res = await User.deleteMany({ email: { $regex: domain, $options: 'i' }, biometricId: null });
    if(res.deletedCount > 0) {
        console.log(`🗑️ Deleted ${res.deletedCount} users with @${domain}`);
        totalDeleted += res.deletedCount;
    }
  }

  // B. ফেক নাম দিয়ে খোঁজা
  for (const name of fakeNames) {
    const res = await User.deleteMany({ fullName: { $regex: name, $options: 'i' }, biometricId: null });
    if(res.deletedCount > 0) {
        console.log(`🗑️ Deleted ${res.deletedCount} users named "${name}"`);
        totalDeleted += res.deletedCount;
    }
  }

  // C. যাদের ইমেইল নেই বা খুব স্প্যামি (Optional - সাবধানে ব্যবহার করবেন)
  // const resNoEmail = await User.deleteMany({ email: { $exists: false } });
  // totalDeleted += resNoEmail.deletedCount;

  console.log(`\n🏁 Total Cleaned: ${totalDeleted} users removed.`);

  // --- যাচাই করা (Verification) ---
  console.log("\n👥 Remaining Real Users (with Biometric ID):");
  const realUsers = await User.find({ biometricId: { $ne: null } }).select("fullName email biometricId employeeId");
  realUsers.forEach(u => {
    console.log(`  ✅ [${u.biometricId}] ${u.fullName} (${u.email})`);
  });

  console.log("\n⚠️ Users without Biometric ID (Check if these are needed):");
  const noBioUsers = await User.find({ biometricId: null }).select("fullName email role");
  noBioUsers.forEach(u => {
    // শুধু Admin/HR roles গুলো দেখাবে, বাকিগুলো সম্ভবত জঙ্ক
    if(['super_admin', 'admin', 'hr_manager'].includes(u.role)) {
        console.log(`  ℹ️  [${u.role.toUpperCase()}] ${u.fullName} (${u.email})`);
    } else {
        console.log(`  ❓ [${u.role}] ${u.fullName} (${u.email}) -> Maybe delete manually?`);
    }
  });

  await mongoose.disconnect();
  process.exit(0);
})();