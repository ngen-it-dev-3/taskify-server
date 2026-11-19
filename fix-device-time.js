// fix-device-time.js
const ZKLib = require("zkteco-js");

(async () => {
  const zk = new ZKLib("192.168.1.201", 4370, 10000, 4000);
  try {
    await zk.createSocket();

    const before = await zk.getTime();
    // ✅ 12-hour format e convert kora holo
    console.log("🕐 Device time (before):", new Date(before).toLocaleTimeString('en-US', { hour12: true }));
    console.log("💻 PC time (correct) :", new Date().toLocaleTimeString('en-US', { hour12: true }));

    // PC er sothik somoy device e set korun
    await zk.setTime(new Date());

    const after = await zk.getTime();
    console.log("✅ Device time (after) :", new Date(after).toLocaleTimeString('en-US', { hour12: true }));

    await zk.disconnect();
    console.log("\n🎉 Time fixed! Ekhon theke notun punch sothik somoye hobe.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    try { await zk.disconnect(); } catch {}
  }
})();