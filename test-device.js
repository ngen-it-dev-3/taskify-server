// test-device.js
const ZKLib = require("zkteco-js");

const DEVICE_IP = "192.168.1.201";
const PORT = 4370;

(async () => {
  const zk = new ZKLib(DEVICE_IP, PORT, 10000, 4000);
  try {
    console.log(`\n🔌 Connecting to ${DEVICE_IP}:${PORT}...`);
    await zk.createSocket();
    console.log("✅ Connected!\n");

    // ---- Users ----
    const users = await zk.getUsers();
    console.log(`👥 Enrolled Users (${users.data.length}):`);
    users.data.forEach((u) =>
      console.log(`  UID: ${u.uid} | UserID: ${u.userId} | Name: ${u.name}`)
    );

    // ---- Attendance logs (FIXED field names) ----
    const logs = await zk.getAttendances();
    console.log(`\n🕐 Total Punches: ${logs.data.length}`);

    // Raw first record — structure confirm করার জন্য
    console.log("\n📦 Sample raw record:", logs.data[logs.data.length - 1]);

    console.log("\nLast 15 punches:");
    logs.data.slice(-15).forEach((l) =>
      console.log(
        `  UserID: ${l.user_id} | ${new Date(l.record_time).toLocaleString()} | state: ${l.state}`
      )
    );

    // ---- আজকের punches আলাদা করে ----
    const today = new Date().toDateString();
    const todayLogs = logs.data.filter(
      (l) => new Date(l.record_time).toDateString() === today
    );
    console.log(`\n📅 Today's punches (${todayLogs.length}):`);
    todayLogs.forEach((l) =>
      console.log(`  UserID: ${l.user_id} | ${new Date(l.record_time).toLocaleTimeString()}`)
    );

    await zk.disconnect();
    console.log("\n✅ Done!");
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    try { await zk.disconnect(); } catch {}
  }
})();