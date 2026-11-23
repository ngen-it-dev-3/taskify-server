const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Meeting title/purpose is required"],
      trim: true,
    },
    withAttendees: {
      type: String,
      required: [true, "Attendees / group is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["Video Call", "In-Person", "Phone Call"],
      default: "Video Call",
    },
    venue: {
      type: String,
      default: "",
      trim: true,
    },
    meetingLink: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    scheduledDate: {
      type: Date,
      default: null,
    },
    timeSlotLabel: {
      type: String,
      default: "",
      trim: true,
    },
    preferredDateText: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending Approval", "Confirmed", "Declined", "Completed"],
      default: "Pending Approval",
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedByName: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Meeting", meetingSchema);