// src/services/zkSyncService.js
const ZKLib = require("zkteco-js");
const cron = require("node-cron");
const { User } = require("../models/User.model");
const { Attendance, attendanceStatus } = require("../models/Attendance.model");

// ============================================================================
// CONFIG & RULES
// ============================================================================
const DEVICE_IP = process.env.ZK_DEVICE_IP || "192.168.1.201";
const DEVICE_PORT = Number(process.env.ZK_DEVICE_PORT || 4370);

// ⏰ Clock Fix Configuration
const TIME_OFFSET_MINUTES = Number(process.env.ZK_TIME_OFFSET_MINUTES || 0);
const CLOCK_FIXED_DATE = process.env.ZK_CLOCK_FIXED_DATE || ""; // e.g., "2026-11-19"

// ⏰ Time Thresholds (in minutes from midnight)
const THRESHOLDS = {
  LATE_IN: 9 * 60 + 6,        // 9:06 AM
  DOUBLE_LATE_IN: 10 * 60 + 1, // 10:01 AM
  DOUBLE_LATE_OUT: 17 * 60 + 29, // 5:29 PM
  LATE_OUT: 17 * 60 + 54,     // 5:54 PM
};

const FULL_DAY_HOURS = 8;
const HALF_DAY_MAX_HOURS = 4;
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

let isSyncing = false;

// ============================================================================
// HELPERS
// ============================================================================
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

// ============================================================================
// MAIN SYNC LOGIC
// ============================================================================
async function syncDeviceLogs({ fromDate = null } = {}) {
  if (isSyncing) return { success: false, message: "Sync already in progress" };
  isSyncing = true;

  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 20000, 4000);
  const summary = { punches: 0, updated: 0, failed: 0, unmatched: new Set() };

  try {
    await zk.createSocket();
    const { data: logs } = await zk.getAttendances();
    summary.punches = logs.length;
    console.log(`[ZK] ${logs.length} punches fetched from ${DEVICE_IP}`);

    const users = await User.find({})
      .select("_id fullName email employeeId biometricId department departmentId position jobTitle isActive")
      .populate("department", "name").populate("departmentId", "name").lean();

    const userMap = new Map();
    for (const u of users) {
      if (u.biometricId) userMap.set(String(u.biometricId), u);
      if (u.employeeId) userMap.set(String(u.employeeId), u);
    }

    const grouped = new Map();
    for (const log of logs) {
      let t = new Date(log.record_time);
      if (isNaN(t.getTime())) continue;
      
      let ds = toDateStr(t);

      // ✅ CRITICAL FIX: Skip or adjust data before clock was fixed
      if (CLOCK_FIXED_DATE && ds < CLOCK_FIXED_DATE) {
        if (TIME_OFFSET_MINUTES !== 0) {
          // Apply offset if configured for old data
          t = new Date(t.getTime() + TIME_OFFSET_MINUTES * 60000);
          ds = toDateStr(t);
        } else {
          // If no offset, skip garbage data entirely
          continue; 
        }
      }

      if (fromDate && ds < fromDate) continue;
      
      const uid = String(log.user_id);
      const key = `${uid}_${ds}`;
      if (!grouped.has(key)) grouped.set(key, { uid, day: dayStart(t), punches: [] });
      grouped.get(key).punches.push(t);
    }

    for (const { uid, day, punches } of grouped.values()) {
      const emp = userMap.get(uid);
      if (!emp) { summary.unmatched.add(uid); continue; }

      try {
        punches.sort((a, b) => a - b);
        const clean = punches.filter((t, i) => i === 0 || t - punches[i - 1] > DEDUP_WINDOW_MS);
        const checkIn = clean[0];
        const checkOut = clean.length > 1 ? clean[clean.length - 1] : null;

        const workingMs = checkOut ? checkOut - checkIn : 0;
        const workingHours = +(workingMs / 3600000).toFixed(2);

        // 🎯 STATUS CALCULATION
        const inMin = checkIn.getHours() * 60 + checkIn.getMinutes();
        const outMin = checkOut ? (checkOut.getHours() * 60 + checkOut.getMinutes()) : null;

        let status = attendanceStatus.PRESENT;
        let note = "";

        // 1. Check-In Rules
        if (inMin > THRESHOLDS.DOUBLE_LATE_IN) {
          status = attendanceStatus.DOUBLE_LATE;
          note = "Double Late: Arrived after 10:01 AM";
        } else if (inMin > THRESHOLDS.LATE_IN) {
          status = attendanceStatus.LATE;
          note = "Late: Arrived after 9:06 AM";
        }

        // 2. Check-Out Rules
        if (checkOut && status !== attendanceStatus.DOUBLE_LATE) {
          if (outMin < THRESHOLDS.DOUBLE_LATE_OUT) {
            status = attendanceStatus.DOUBLE_LATE;
            note = "Double Late: Left before 5:29 PM";
          } else if (outMin < THRESHOLDS.LATE_OUT) {
            status = attendanceStatus.LATE;
            note = "Late: Left before 5:54 PM";
          }
        }

        // 3. Half Day Rule (Overrides others if hours < 4)
        if (checkOut && workingHours < HALF_DAY_MAX_HOURS) {
          status = attendanceStatus.HALF_DAY;
          note = "Half Day: Worked less than 4 hours";
        }

        if (!checkOut && !note) note = "Missing check-out punch";

        const overtime = +Math.max(0, workingHours - FULL_DAY_HOURS).toFixed(2);
        const deptName = emp.department?.name || emp.departmentId?.name || "Unassigned";
        const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1);

        await Attendance.findOneAndUpdate(
          { employeeId: emp._id, date: { $gte: day, $lt: nextDay } },
          {
            $setOnInsert: { employeeId: emp._id, date: day },
            $set: {
              employeeName: emp.fullName,
              employeeEmail: emp.email,
              employeeDepartment: deptName,
              employeePosition: emp.position || emp.jobTitle || "",
              checkIn, checkOut: checkOut || null,
              checkInTime: fmtTime(checkIn),
              checkOutTime: checkOut ? fmtTime(checkOut) : null,
              workingHours, totalWorkingTime: workingMs, overtime,
              status, location: "Biometric Device", notes: note
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        summary.updated++;
      } catch (e) {
        summary.failed++;
        console.error(`[ZK] Failed ${uid} @ ${toDateStr(day)}:`, e.message);
      }
    }

    console.log(`[ZK] ✅ Sync done — ${summary.updated} saved, ${summary.failed} failed` +
      (summary.unmatched.size ? ` | ⚠️ Unmapped IDs: ${[...summary.unmatched].join(", ")}` : ""));
    return { success: true, ...summary, unmatched: [...summary.unmatched] };
  } catch (err) {
    console.error("[ZK] ❌ Sync failed:", err.message);
    return { success: false, message: err.message };
  } finally {
    try { await zk.disconnect(); } catch { }
    isSyncing = false;
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================
function startZKSync() {
  setInterval(() => syncDeviceLogs({ fromDate: toDateStr(new Date()) }), 1000);
  cron.schedule("55 23 * * *", () => syncDeviceLogs({ fromDate: toDateStr(new Date()) }));
  setTimeout(() => syncDeviceLogs(), 1000);
}

module.exports = { startZKSync, syncDeviceLogs };