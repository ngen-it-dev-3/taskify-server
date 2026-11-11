// src/models/TenderDocumentTask.model.js
const mongoose = require("mongoose");

const TenderDocumentTaskSchema = new mongoose.Schema(
    {
        tenderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tender",
            required: true,
            index: true,
        },
        /** Optional: scope this task under a section of the tender's submission package */
        sectionId: { type: String, default: "", index: true },
        title: { type: String, required: true, trim: true },
        owner: { type: String, default: "" },
        fileName: { type: String, default: "No file uploaded yet" },
        fileUrl: { type: String, default: "" },
        status: {
            type: String,
            enum: ["Pending", "In Progress", "Done"],
            default: "Pending",
            index: true,
        },
        order: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports =
    mongoose.models.TenderDocumentTask ||
    mongoose.model("TenderDocumentTask", TenderDocumentTaskSchema);