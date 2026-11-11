// src/models/DocumentCategory.model.js
const mongoose = require("mongoose");

const DocumentCategorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }, // "legal" or "custom_123"
    label: { type: String, required: true },            // "Legal Docs" or "New Tab"
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.DocumentCategory || mongoose.model("DocumentCategory", DocumentCategorySchema);