// src/models/TenderClient.model.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    role: { type: String, default: "" },
    email: { type: String, default: "" },
}, { _id: true });

const TenderHistorySchema = new mongoose.Schema({
    tenderName: { type: String, required: true },
    status: { type: String, enum: ["Won", "Lost", "Submitted"], default: "Won" },
    year: { type: String, default: "" },
}, { _id: true });

const TenderClientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    sector: { type: String, default: "Government" },
    status: { 
        type: String, 
        enum: ["Served", "Not attended", "Potential"], 
        default: "Potential" 
    },
    relationship: { 
        type: String, 
        enum: ["Strong", "Good", "New", "Needs work"], 
        default: "New" 
    },
    isMustMake: { type: Boolean, default: false },
    businessPotential: { 
        type: String, 
        enum: ["High", "Medium", "Low", "Unknown"], 
        default: "Unknown" 
    },
    estimatePotential: { type: String, default: "" }, // e.g. "10-15 Lac"
    whatWeCanOffer: { type: [String], default: [] }, // e.g. ["Firewall", "Backup"]
    nextStep: { type: String, default: "" },
    nextStepDate: { type: Date, default: null },
    salesOwner: { type: String, default: "Unassigned" },
    source: { type: String, default: "" },
    
    contacts: [ContactSchema],
    notes: { type: String, default: "" },
    tenderHistory: [TenderHistorySchema],
    
    wonCount: { type: Number, default: 0 },
    totalTenders: { type: Number, default: 0 },
    wonValue: { type: String, default: "-" },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.models.TenderClient || mongoose.model("TenderClient", TenderClientSchema);