// models/Attendance.model.js
const mongoose = require("mongoose");

const attendanceStatus = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  DOUBLE_LATE: "double-late", // ✅ নতুন স্ট্যাটাস যোগ করা হলো
  HALF_DAY: "half-day",
  ON_LEAVE: "on-leave",
};

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    employeeDepartment: { type: String, required: true },
    employeePosition: { type: String, default: "" },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    checkInTime: { type: String },
    checkOutTime: { type: String },
    timerStart: { type: Date },
    timerPaused: { type: Boolean, default: false },
    timerPausedAt: { type: Date },
    totalPausedDuration: { type: Number, default: 0 },
    totalWorkingTime: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(attendanceStatus), // ✅ এখন double-late সাপোর্ট করবে
      default: attendanceStatus.PRESENT,
    },
    workingHours: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    location: { type: String, default: "" },
    notes: { type: String, default: "" },
    checkInLocation: { latitude: { type: Number }, longitude: { type: Number }, address: { type: String } },
    checkOutLocation: { latitude: { type: Number }, longitude: { type: Number }, address: { type: String } },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });

attendanceSchema.pre("save", function (next) {
  if (this.checkIn && this.checkOut) {
    const diffInMs = this.checkOut.getTime() - this.checkIn.getTime();
    this.workingHours = parseFloat((diffInMs / (1000 * 60 * 60)).toFixed(2));
    const standardHours = 8;
    this.overtime = this.workingHours > standardHours
      ? parseFloat((this.workingHours - standardHours).toFixed(2))
      : 0;

    this.checkInTime = this.checkIn.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    this.checkOutTime = this.checkOut.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  next();
});

module.exports = {
  Attendance: mongoose.model("Attendance", attendanceSchema),
  attendanceStatus,
};