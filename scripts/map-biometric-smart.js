// scripts/map-biometric-smart.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

// Device UserID -> Possible Identifiers (Name fragments, Email parts, or EmpID)
// আমি আপনার DB লিস্ট দেখে কিছু অনুমান করেছি। ভুল থাকলে এডিট করুন।
const mapping = {
  "101": { search: "superadmin@taskmanager.com" }, // CEO might be Super Admin? Or check name
  "112": { search: "szamansaju@gmail.com" },       // Sajeduzzaman -> Sazeduzzaman Saju
  "114": { search: "site2.ngenit@gmail.com" },     // Ekramul -> Kazi Akramul Arefin
  "111": { search: "minhajvai@gmail.com" },        // Minhaj -> Minhajul Islam
  "106": { search: "site1.ngenit@gmail.com" },     // Shahed -> Shazidul Alam? (Check carefully)
  "161": { search: "site3.ngenit@gmail.com" },     // Kferdous -> Fairooz Maliha? (Check carefully)
  "169": { search: "rmehedi@gmail.com" },          // Tushar -> Md Russel Jahan Mehedi? (Check carefully)
  "132": { search: "hr2.jaragroups@gmail.com" },   // Ruhul -> Habibur Rahman Minhaj? (Check carefully)
  "133": { search: "sales@ngenitltd.com" },        // Jahirul -> ADAN MAHMUD? (Check carefully)
  "146": { search: "EMP-400" },                    // Maksud -> Shazidul Alam has EMP-400? 
  "147": { search: "EMP-101" },                    // Baktar -> Fairooz Maliha has EMP-101?
  "125": { search: "fairoozpust10@gmail.com" },    // Fairooz -> Anika Ahmed?
  "128": { search: "test07@gmail.com" },           // Sobuj -> Kanack Mohan Chakma?
  "110": { search: "EMP961438" },                  // Kanok -> Kanack Mohan Chakma
  "108": { search: "site5.ngenit@gmail.com" },     // AkasH -> Akash Ahmed
  "143": { search: "doe@example.com" },            // Enamul -> Business Development?
  "136": { search: "demo.ngenit@gmail.com" },      // Saz -> Demo Employee?
};

// ⚠️ WARNING: উপরের ম্যাপিংগুলো আমার অনুমান। 
// দয়া করে নিচের আউটপুট দেখে নিশ্চিত হোন যে সঠিক মানুষের সাথে ম্যাপ হচ্ছে কিনা।
// যদি ভুল ম্যাপ হয়, তবে Attendance ডাটা ভুল মানুষের নামে চলে যাবে।

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("🔍 Starting Smart Mapping...\n");

  for (const [deviceId, config] of Object.entries(mapping)) {
    const searchTerm = config.search;
    
    // Try to find user by Email OR EmployeeId OR FullName (case insensitive)
    const user = await User.findOne({
      $or: [
        { email: searchTerm },
        { employeeId: searchTerm },
        { fullName: new RegExp(searchTerm, "i") }
      ]
    }).select("fullName email employeeId");

    if (user) {
      await User.updateOne({ _id: user._id }, { $set: { biometricId: deviceId } });
      console.log(`✅ ${deviceId} -> ${user.fullName} (${user.email})`);
    } else {
      console.log(`❌ ${deviceId} -> NOT FOUND for term: "${searchTerm}"`);
    }
  }

  console.log("\n🏁 Mapping Complete. Please verify in DB.");
  await mongoose.disconnect();
  process.exit(0);
})();