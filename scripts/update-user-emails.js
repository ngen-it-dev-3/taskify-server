// scripts/update-user-emails.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ DB Connected\n");

  // ⚠️ আপনার দেওয়া সঠিক ইমেইল লিস্ট অনুযায়ী আপডেট
  const emailUpdates = [
    { bioId: "101", email: "superadmin@taskmanager.com" }, // Super Admin
    { bioId: "112", email: "dev3.ngenit@gmail.com" },      // Sazeduzzaman Saju
    { bioId: "114", email: "site2.ngenit@gmail.com" },     // Kazi Akramul Arefin
    { bioId: "136", email: "site1.ngenit@gmail.com" },     // Shazidul Alam
    { bioId: "15",  email: "hr2.jaragroups@gmail.com" },   // Minhaj
    { bioId: "2",   email: "ceo@ngenitltd.com" },          // CEO (Placeholder - update if real exists)
    { bioId: "32",  email: "maksud@ngenitltd.com" },       // Maksud
    { bioId: "35",  email: "site3.ngenit@gmail.com" },     // Fairooz
    { bioId: "37",  email: "abdullah.ngenit@gmail.com" },  // Kanok
    // N/A ওয়ালদের জন্য placeholder ইমেইল দেওয়া হলো, HR পরে এডিট করতে পারবে
    { bioId: "17",  email: "shahed@ngenitltd.com" },       
    { bioId: "30",  email: "ruhul@ngenitltd.com" },        
    { bioId: "39",  email: "enamul@ngenitltd.com" },       
  ];

  let updatedCount = 0;
  for (const update of emailUpdates) {
    const result = await User.updateOne(
      { biometricId: update.bioId },
      { $set: { email: update.email } }
    );
    
    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      updatedCount++;
      console.log(`✅ Updated BioID ${update.bioId}: ${update.email}`);
    } else {
      console.log(`⚠️ Not found: BioID ${update.bioId}`);
    }
  }

  console.log(`\n🏁 Total Emails Updated: ${updatedCount}\n`);

  // ✅ Final Verification
  console.log("👥 Final User List with Correct Emails:");
  const users = await User.find({ biometricId: { $ne: null } })
    .select("fullName email biometricId")
    .sort({ biometricId: 1 });
    
  users.forEach(u => {
    console.log(`  [${u.biometricId}] ${u.fullName} → ${u.email}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})();