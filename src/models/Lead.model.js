// src/models/Lead.model.js
const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema(
  {
    // Link back to a Contact (source of the lead)
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },

    companyName: { type: String, required: true, trim: true },
    dealName: { type: String, default: "" },

    // Pipeline stage
    stage: {
      type: String,
      enum: [
        "lead_in",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      default: "lead_in",
      index: true,
    },

    value: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      enum: ["BDT", "SAR", "USD", "AED", "INR", "EUR", "GBP"],
      default: "BDT",
      uppercase: true,
    },
    probability: { type: Number, default: 10, min: 0, max: 100 },

    expectedCloseDate: { type: Date, index: true },
    closedAt: { type: Date, default: null },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Scoring
    score: { type: Number, default: 0, index: true },
    scoreBreakdown: [
      {
        reason: { type: String },
        points: { type: Number },
      },
    ],

    // Engagement metrics (feed scoring)
    engagement: {
      emailsOpened: { type: Number, default: 0 },
      emailsSent: { type: Number, default: 0 },
      callsMade: { type: Number, default: 0 },
      meetingsHeld: { type: Number, default: 0 },
      lastEngagementAt: { type: Date, default: null },
    },

    // Activity feed summary — full entries in DealActivity collection
    lastActivityAt: { type: Date, default: null },

    // Stage transition history
    stageHistory: [
      {
        from: { type: String },
        to: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: { type: String, default: "" },
      },
    ],

    // Outcome after Won
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    lostReason: { type: String, default: "" },

    // Optional links
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

    tags: [{ type: String }],
    notes: { type: String, default: "", maxlength: 2000 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

LeadSchema.index({ stage: 1, owner: 1 });
LeadSchema.index({ companyName: "text", dealName: "text" });
LeadSchema.index({ expectedCloseDate: 1, stage: 1 });

// Virtual: weighted value (value × probability / 100)
LeadSchema.virtual("weightedValue").get(function () {
  return Math.round(((this.value * this.probability) / 100) * 100) / 100;
});

LeadSchema.set("toJSON", { virtuals: true });
LeadSchema.set("toObject", { virtuals: true });

module.exports = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);