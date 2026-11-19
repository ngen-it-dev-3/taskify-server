// scripts/clean-attendance-dupes.js

// ⭐ server.js এর মতো DNS override — এটাই বাদ ছিল!
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const { Attendance } = require("../src/models/Attendance.model");

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");

    // ---- 1) Duplicate খুঁজুন (local day অনুযায়ী) ----
    const dupes = await Attendance.aggregate([
      {
        $group: {
          _id: {
            emp: "$employeeId",
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$date",
                timezone: "Asia/Dhaka", // ✅ BD time অনুযায়ী দিন
              },
            },
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let removed = 0;
    for (const d of dupes) {
      const [keep, ...rest] = d.ids;
      await Attendance.deleteMany({ _id: { $in: rest } });
      removed += rest.length;
    }
    console.log(`🧹 Removed ${removed} duplicates (${dupes.length} groups)`);

    // ---- 2) সব date কে local midnight এ normalize করুন ----
    // (পুরনো timer record গুলো নন-midnight সময়ে আছে → unique index কাজ করবে না)
    const all = await Attendance.find({}).select("_id date").lean();
    let normalized = 0;
    for (const rec of all) {
      const d = new Date(rec.date);
      if (d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0) {
        d.setHours(0, 0, 0, 0);
        await Attendance.updateOne({ _id: rec._id }, { $set: { date: d } });
        normalized++;
      }
    }
    console.log(`🕐 Normalized ${normalized} dates to midnight`);

    // ---- 3) Normalize এর পর আবার duplicate check ----
    const dupes2 = await Attendance.aggregate([
      { $group: { _id: { emp: "$employeeId", date: "$date" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    let removed2 = 0;
    for (const d of dupes2) {
      const [, ...rest] = d.ids;
      await Attendance.deleteMany({ _id: { $in: rest } });
      removed2 += rest.length;
    }
    if (removed2) console.log(`🧹 Removed ${removed2} post-normalize duplicates`);

    // ---- 4) Index rebuild ----
    await Attendance.syncIndexes();
    console.log("✅ Unique index ensured");

    const total = await Attendance.countDocuments();
    console.log(`📊 Total attendance records: ${total}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();