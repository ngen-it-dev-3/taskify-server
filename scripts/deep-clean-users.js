// scripts/deep-clean-users.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  let totalDeleted = 0;

  // ১. নির্দিষ্ট ইমেইল দিয়ে ডিলিট (আপনার উল্লেখ করা ৩ জন + অন্য ফেকগুলো)
  const emailsToDelete = [
    "site6.ngenit@gmail.com",      // Raju Ahmed
    "akram@gmail.com",             // Fake Super Admin
    "site10.ngenit@gmail.com",     // Fake Admin
    "jarigi@mailinator.com",       // Labore ipsum
    "vylexy@mailinator.com",       // Enim quibusdam
    "mike@example.com",            // Mike Tyson
    "hihiu@gmail.com",             // fytfyf
    "minhajvai2@gmail.com",        // Duplicate Minhaj
    "dev3.ngenit+1014150307@gmail.com", // Dev test account
    "dev3.ngenit+card1014150357@gmail.com" // Card test account
  ];

  for (const email of emailsToDelete) {
    const res = await User.deleteMany({ email });
    if (res.deletedCount > 0) {
      console.log(`🗑️ Deleted: ${email}`);
      totalDeleted += res.deletedCount;
    }
  }

  // ২. প্যাটার্ন ম্যাচ করে আরও জঙ্ক খোঁজা (যদি থেকে থাকে)
  const junkPatterns = [
    { field: "email", regex: /mailinator|example\.com|democorp/i },
    { field: "fullName", regex: /^(demo|test|fake|dummy|mike tyson|john cena|labore|enim|fytfyf)$/i }
  ];

  for (const pattern of junkPatterns) {
    const query = {};
    query[pattern.field] = pattern.regex;
    // যাদের Biometric ID নেই শুধু তাদেরই ডিলিট করবো যাতে রিয়েল ইউজার না যায়
    query.biometricId = null; 
    
    const res = await User.deleteMany(query);
    if (res.deletedCount > 0) {
      console.log(`🗑️ Pattern Match (${pattern.field}): ${res.deletedCount} users deleted`);
      totalDeleted += res.deletedCount;
    }
  }

  console.log(`\n🏁 Total Deleted: ${totalDeleted} users.\n`);

  // ৩. ফাইনাল ভেরিফিকেশন - এখন কি অবস্থা?
  console.log("👥 Remaining Users in DB:");
  const allUsers = await User.find({}).select("fullName email biometricId role employeeId").sort({ biometricId: 1 });
  
  allUsers.forEach(u => {
    const tag = u.biometricId ? `✅ [Bio:${u.biometricId}]` : `ℹ️  [No Bio]`;
    const roleTag = u.role !== 'employee' ? `(${u.role})` : '';
    console.log(`  ${tag} ${u.fullName} ${roleTag} | ${u.email}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})();