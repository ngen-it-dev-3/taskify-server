// scripts/sync-attendance-emails.js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User.model");
const Attendance = require("../src/models/Attendance.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}, "_id fullName email").lean();

  for (const u of users) {
    await Attendance.updateMany(
      { employeeId: u._id },
      { $set: { employeeEmail: u.email, employeeName: u.fullName } }
    );
  }

  console.log("✅ All attendance emails synced with User collection.");
  await mongoose.disconnect();
})();