// models/CredentialAccessLog.model.js
const mongoose = require("mongoose");

const CredentialAccessLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, default: "" },
  action: { 
    type: String, 
    enum: ["reveal", "copy", "edit", "grant_access", "revoke_access"], 
    required: true 
  },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: "SiteSource", default: null },
  siteName: { type: String, default: "" },
  details: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.models.CredentialAccessLog || mongoose.model("CredentialAccessLog", CredentialAccessLogSchema);