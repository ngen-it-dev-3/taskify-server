// src/models/Tenant.model.js
const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    // Primary admin (the "Your name" + first email)
    adminName: { type: String, required: true },
    adminEmail: { type: String, required: true, lowercase: true, trim: true },

    // Trial
    plan: {
      type: String,
      enum: ["year", "month"],
      default: "year",
    },
    users: { type: Number, required: true, default: 1 },
    pricePerUser: { type: Number, default: 100 },
    currency: { type: String, default: "Tk" },

    // Trial state
    trialStatus: {
      type: String,
      enum: ["active", "expired", "converted", "cancelled"],
      default: "active",
    },
    trialStartsAt: { type: Date, default: Date.now },
    trialEndsAt: { type: Date, required: true },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["invoice", "card"],
      default: "invoice",
    },
    paymentIntentId: { type: String, default: null },

    // All emails created in this tenant
    memberEmails: [{ type: String, lowercase: true, trim: true }],

    // Additional fields
    phone: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", TenantSchema);