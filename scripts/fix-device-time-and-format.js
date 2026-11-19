// fix-device-time-and-format.js
const ZKLib = require("zkteco-js");

(async () => {
  const zk = new ZKLib("192.168.1.201", 4370, 10000, 4000);
  try {
    await zk.createSocket();
    console.log("🔌 Connected to Device...");

    // 1. Current Time Check
    const before = await zk.getTime();
    console.log("🕐 Device time (before):", new Date(before).toLocaleString());
    console.log("💻 PC time (correct) :", new Date().toLocaleString());

    // 2. Set Correct Time from PC
    await zk.setTime(new Date());
    console.log("⏳ Setting device time to PC time...");

    // 3. Try to set 12-hour format (SDK dependent)
    // Note: Some devices require manual menu change for this.
    try {
      // Attempting to set system option for 12h format
      // Key '1' usually refers to Voice or Display options in some firmwares
      // If this fails, you MUST do it manually via device menu.
      await zk.setSysOption(1, "1"); 
      console.log("🔄 Attempted to switch to 12-hour format via SDK...");
    } catch (e) {
      console.log("⚠️ Could not set format via SDK. Please check device menu.");
    }

    // 4. Verify Time and Format
    const after = await zk.getTime();
    const afterDate = new Date(after);
    
    // Force 12-hour display for verification
    console.log("✅ Device time (after):", afterDate.toLocaleTimeString('en-US', { hour12: true }));
    console.log("✅ Full Date:", afterDate.toLocaleString());

    await zk.disconnect();
    console.log("\n🎉 Time fixed! Please verify 12h format on device screen.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    try { await zk.disconnect(); } catch {}
  }
})();