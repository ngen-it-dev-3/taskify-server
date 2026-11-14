// src/models/TenderSecurity.model.js
const mongoose = require("mongoose");

const PaymentEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  mode: { type: String, default: "Bank transfer" },
  reference: { type: String, default: "" },
  enteredBy: { type: String, default: "Admin" },
  enteredById: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note: { type: String, default: "" },
}, { _id: false });

const TenderSecuritySchema = new mongoose.Schema(
  {
    entity: { type: String, required: true, trim: true, index: true },
    clientDescription: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["Tender Security", "Performance Security", "Payments"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT" },

    // ✅ নতুন ফিল্ডগুলো (Tender Security & Performance Security এর জন্য)
    purchaseDate: { type: Date, default: null },
    securityClosingDate: { type: Date, default: null },
    purchaseFrom: { type: String, default: "" },
    purchaseType: { type: String, default: "" },
    validityDate: { type: Date, default: null }, // আপনার মডেলে dueDate ছিল, UI তে validityDate চাওয়া হয়েছে
    documentUrl: { type: String, default: "" }, // "Choose File" এর জন্য

    // Payment Section (আগের মতোই আছে)
    invoiceNo: { type: String, default: "No invoice yet" },
    invoiceDate: { type: Date, default: null },
    receivedAmount: { type: Number, default: 0 },
    delivery: {
      type: String,
      enum: ["Delivered", "In delivery", "Closed", "Pending"],
      default: "In delivery"
    },

    payments: { type: [PaymentEntrySchema], default: [] },

    dueDate: { type: Date, default: null, index: true }, // পুরোনো ফিল্ড
    docsStatus: { type: String, enum: ["Attached", "Missing"], default: "Missing" },

    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: "Tender", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.TenderSecurity || mongoose.model("TenderSecurity", TenderSecuritySchema);