// src/models/TenderSecurity.model.js
const mongoose = require("mongoose");

// src/models/TenderSecurity.model.js
const PaymentEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  mode: { type: String, default: "Bank transfer" },
  reference: { type: String, default: "" },

  // ✅ Save the User ID instead of the giant Base64 string
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
      enum: ["Tender Security", "Performance Security", "Bank Guarantee"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT" },

    // Fields for the table
    invoiceNo: { type: String, default: "No invoice yet" },
    invoiceDate: { type: Date, default: null },
    receivedAmount: { type: Number, default: 0 },
    delivery: {
      type: String,
      enum: ["Delivered", "In delivery", "Closed", "Pending"],
      default: "In delivery"
    },

    // ✅ NEW: History of payments
    payments: { type: [PaymentEntrySchema], default: [] },

    dueDate: { type: Date, default: null, index: true },
    docsStatus: { type: String, enum: ["Attached", "Missing"], default: "Missing" },

    documentUrl: { type: String, default: "" },
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: "Tender", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.TenderSecurity || mongoose.model("TenderSecurity", TenderSecuritySchema);