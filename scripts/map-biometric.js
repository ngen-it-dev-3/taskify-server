// scripts/map-biometric.js
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../src/models/User.model");

// Device UserID → DB user এর fullName (বা email — যেটা নিশ্চিত)
const mapping = {
  "101": "CEO",
  "112": "Sajeduzzaman",
  "114": "Ekramul",
  "111": "Minhaj",
  "106": "Shahed",
  "161": "Kferdous",
  "169": "Tushar",
  "132": "Ruhul",
  "133": "Jahirul",
  "146": "Maksud",
  "147": "Baktar",
  "125": "Fairooz",
  "128": "Sobuj",
  "110": "Kanok",
  "108": "AkasH",
  "143": "Enamul",
  "136": "Saz",
  // "100" Master Card — বাদ
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // আগে সব user দেখে নিন
  const users = await User.find({}).select("fullName email employeeId biometricId").lean();
  console.log("\n👥 DB Users:");
  users.forEach((u) =>
    console.log(`  ${u.fullName} | ${u.email} | empId: ${u.employeeId || "-"} | bio: ${u.biometricId || "-"}`)
  );

  console.log("\n🔗 Mapping:");
  for (const [deviceId, name] of Object.entries(mapping)) {
    const user = await User.findOne({ fullName: new RegExp(`^${name}$`, "i") });
    if (!user) {
      console.log(`  ⚠️  ${deviceId} → "${name}" : NOT FOUND in DB`);
      continue;
    }
    await User.updateOne({ _id: user._id }, { $set: { biometricId: deviceId } });
    console.log(`  ✅ ${deviceId} → ${user.fullName} (${user.email})`);
  }

  await mongoose.disconnect();
  process.exit(0);
})();