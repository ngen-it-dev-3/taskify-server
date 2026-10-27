// src/models/CompanyDocument.model.js
const mongoose = require("mongoose");

const CompanyDocumentSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["legal", "profiles", "work-orders", "certificates", "team", "datasheets"],
      required: true,
      index: true,
    },

    /* ---------- Common fields ---------- */
    title: { type: String, required: true, trim: true }, // Client Name, Doc Name, Person Name, Product Title
    description: { type: String, default: "" },          // Short description / Profile desc
    reference: { type: String, default: "" },            // Reference / ID No.
    validity: { type: String, default: "" },             // Free text validity
    validUntil: { type: Date, default: null, index: true },
    issuedOn: { type: Date, default: null },             // Order Received Date

    status: {
      type: String,
      enum: ["Valid", "Expiring Soon", "Expired"],
      default: "Valid",
      index: true,
    },
    action: {
      type: String,
      enum: ["View", "Replace", "Renew"],
      default: "View",
    },

    /* ---------- File metadata ---------- */
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    fileMime: { type: String, default: "" },
    docType: { type: String, default: "" },

    /* ---------- Profile / Datasheet / Experience ---------- */
    subtitle: { type: String, default: "" },             // Designation, Brand
    chips: { type: [String], default: [] },              // Roles, Skills, Categories

    /* ---------- Work Orders ---------- */
    totalValue: { type: Number, default: 0 },
    customerType: { type: String, default: "" },
    isGovt: { type: Boolean, default: false },
    products: { type: [String], default: [] },
    workType: { type: String, default: "" },
    certReceived: { type: Boolean, default: false },

    /* ---------- Team & CVs ---------- */
    experienceYears: { type: Number, default: 0 },
    isEngineer: { type: Boolean, default: false },

    /* ---------- Import tracking ---------- */
    importedInto: [
      {
        tenderId: { type: mongoose.Schema.Types.ObjectId, ref: "Tender" },
        importedAt: { type: Date, default: Date.now },
        importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

CompanyDocumentSchema.index({ category: 1, createdAt: -1 });
CompanyDocumentSchema.index({ category: 1, status: 1 });
CompanyDocumentSchema.index({ category: 1, validUntil: 1 });
CompanyDocumentSchema.index({ title: "text", description: "text", reference: "text" });

CompanyDocumentSchema.pre("save", function (next) {
  if (this.validUntil) {
    const now = Date.now();
    const diffDays = Math.ceil((this.validUntil.getTime() - now) / 86400000);
    if (diffDays < 0) {
      this.status = "Expired";
      this.action = "Renew";
    } else if (diffDays <= 30) {
      this.status = "Expiring Soon";
      this.action = "Renew";
    } else {
      this.status = "Valid";
      if (this.action === "Renew") this.action = "View";
    }
  }
  next();
});

module.exports = mongoose.models.CompanyDocument || mongoose.model("CompanyDocument", CompanyDocumentSchema);