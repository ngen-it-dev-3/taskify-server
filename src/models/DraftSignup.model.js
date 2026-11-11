// src/models/DraftSignup.model.js
const mongoose = require("mongoose");

const DraftSignupSchema = new mongoose.Schema(
  {
    name: String,
    company: String,
    emails: [String],
    users: Number,
    pricePerUser: Number,
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DraftSignup", DraftSignupSchema);