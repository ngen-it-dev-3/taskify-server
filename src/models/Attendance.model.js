// models/Attendance.model.js

const mongoose = require("mongoose");

const attendanceStatus = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  HALF_DAY: "half-day",
  ON_LEAVE: "on-leave",
};

const attendanceSchema = new mongoose.Schema(
  {
    // Employee Information
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    employeeDepartment: { type: String, required: true },
    employeePosition: { type: String, default: "" },

    // Date & Time
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    checkInTime: { type: String },
    checkOutTime: { type: String },

    // Timer Tracking
    timerStart: { type: Date },
    timerPaused: { type: Boolean, default: false },
    timerPausedAt: { type: Date },
    totalPausedDuration: { type: Number, default: 0 },
    totalWorkingTime: { type: Number, default: 0 },

    // Status & Hours
    status: {
      type: String,
      enum: Object.values(attendanceStatus),
      default: attendanceStatus.PRESENT,
    },
    workingHours: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },

    // Location & Notes
    location: { type: String, default: "" },
    notes: { type: String, default: "" },
    checkInLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    checkOutLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Indexes
attendanceSchema.index({ employeeId: 1, date: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });

// Pre-save middleware
attendanceSchema.pre("save", function (next) {
  if (this.checkIn && this.checkOut) {
    const diffInMs = this.checkOut.getTime() - this.checkIn.getTime();
    this.workingHours = parseFloat((diffInMs / (1000 * 60 * 60)).toFixed(2));

    const standardHours = 8;
    if (this.workingHours > standardHours) {
      this.overtime = parseFloat(
        (this.workingHours - standardHours).toFixed(2),
      );
    } else {
      this.overtime = 0;
    }

    this.checkInTime = this.checkIn.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    this.checkOutTime = this.checkOut.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  next();
});

module.exports = {
  Attendance: mongoose.model("Attendance", attendanceSchema),
  attendanceStatus,
};
