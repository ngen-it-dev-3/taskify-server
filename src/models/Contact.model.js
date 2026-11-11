// src/models/Contact.model.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    whatsappOptIn: { type: Boolean, default: false },

    // Owner = the rep managing this contact
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Temperature
    tag: {
      type: String,
      enum: ["hot", "warm", "cold"],
      default: "cold",
      index: true,
    },

    // Source of acquisition
    source: {
      type: String,
      enum: [
        "demo_request",
        "referral",
        "cold_outreach",
        "website",
        "event",
        "partner",
        "other",
      ],
      default: "other",
    },

    // Company size (for scoring)
    companySize: { type: Number, default: 0 },

    // Optional CRM linkage
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },

    notes: { type: String, default: "", maxlength: 2000 },
    tags: [{ type: String }],
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ContactSchema.index({ name: "text", company: "text", email: "text" });
ContactSchema.index({ owner: 1, tag: 1 });

module.exports =
  mongoose.models.Contact || mongoose.model("Contact", ContactSchema);