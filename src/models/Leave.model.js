const mongoose = require("mongoose");

const leaveTypes = {
  CASUAL: "casual",
  EARNED: "earned",
  SICK: "sick",
  MATERNITY: "maternity",
  PATERNITY: "paternity",
  UNPAID: "unpaid",
  OTHER: "other",
};

const leaveStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

const leaveSchema = new mongoose.Schema(
  {
    // Employee Information
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    employeeRole: { type: String, required: true },
    employeeJoinDate: { type: Date, required: true },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: false,
    },
    departmentName: { type: String, default: "Unassigned" },

    // Leave Details
    type: {
      type: String,
      enum: Object.values(leaveTypes),
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    isHalfDay: { type: Boolean, default: false },
    halfDayType: {
      type: String,
      enum: ["first_half", "second_half", null],
      default: null,
    },

    // Leave Validation
    isPreviousDayOff: { type: Boolean, default: false },
    isNextDayOff: { type: Boolean, default: false },
    isGovernmentHoliday: { type: Boolean, default: false },
    holidayNote: { type: String, default: "" },

    // Substitute / Backup
    substituteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    substituteName: { type: String },
    substituteEmail: { type: String },
    substituteApproved: { type: Boolean, default: false },

    // Contact Information
    contactDuringLeave: { type: String },
    emergencyContact: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      relation: { type: String, default: "" },
    },

    // Reason & Details
    reason: { type: String, required: true },
    additionalDetails: { type: String, default: "" },

    // Signature
    signature: { type: String },
    signatureText: { type: String },
    signedAt: { type: Date },

    // Status & Review
    status: {
      type: String,
      enum: Object.values(leaveStatus),
      default: leaveStatus.PENDING,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedByName: { type: String },
    approvedAt: { type: Date },
    rejectionReason: { type: String },

    // Notification Tracking
    notificationsSent: {
      applied: { type: Boolean, default: false },
      approved: { type: Boolean, default: false },
      rejected: { type: Boolean, default: false },
    },

    // Attachments
    attachments: [{ type: String }],

    // Timestamps
    appliedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Indexes
leaveSchema.index({ employeeId: 1 });
leaveSchema.index({ departmentId: 1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ startDate: 1, endDate: 1 });
leaveSchema.index({ substituteId: 1 });

module.exports = {
  Leave: mongoose.model("Leave", leaveSchema),
  leaveTypes,
  leaveStatus,
};
