// src/models/TenderSettings.model.js
const mongoose = require("mongoose");

const TenderSettingsSchema = new mongoose.Schema(
    {
        /* Single-document store — only one row exists */
        sectors: { type: [String], default: [] },
        customSectors: { type: [String], default: [] },
        productLines: { type: [String], default: [] },
        customProductLines: { type: [String], default: [] },

        valueMin: { type: Number, default: null },
        valueMax: { type: Number, default: null },
        securityMin: { type: Number, default: null },
        securityMax: { type: Number, default: null },
        performanceMin: { type: Number, default: null },
        performanceMax: { type: Number, default: null },

        tenderTypes: { type: [String], default: [] },
        customTenderTypes: { type: [String], default: [] },

        crawlTime: { type: String, default: "06:00" },

        /* Free-form note shown in "Custom Range Criteria" */
        customRangeNote: { type: String, default: "" },

        /* Notification recipients */
        notificationRecipientIds: [
            { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        ],

        /* Last crawl summary + matched results */
        lastCrawl: {
            at: { type: String, default: "" },
            sitesChecked: { type: Number, default: 0 },
            newFound: { type: Number, default: 0 },
            matched: { type: Number, default: 0 },
            ranAt: { type: Date, default: null },
            triggeredBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            /** The actual matched tenders from the crawl */
            results: [
                {
                    title: { type: String, default: "" },
                    tenderer: { type: String, default: "" },
                    sourceSite: { type: String, default: "" },
                    sourceUrl: { type: String, default: "" },
                    budget: { type: Number, default: 0 },
                    securityAmount: { type: Number, default: 0 },
                    publishedAt: { type: Date, default: null },
                    matchedOn: { type: [String], default: [] },
                    tenderId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "Tender",
                        default: null,
                    },
                },
            ],
        },

        /* Tracking */
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

module.exports =
    mongoose.models.TenderSettings ||
    mongoose.model("TenderSettings", TenderSettingsSchema);