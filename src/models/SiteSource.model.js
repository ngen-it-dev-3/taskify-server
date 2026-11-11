// src/models/SiteSource.model.js
const mongoose = require("mongoose");

const SiteSourceSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        url: { type: String, required: true, trim: true },
        domain: { type: String, default: "" },

        /* ---------- SELECTORS ---------- */
        /* listSelector is now OPTIONAL — blank means "auto-detect at crawl time" */
        listSelector: { type: String, default: "" },
        titleSelector: { type: String, default: "" },
        linkSelector: { type: String, default: "" },
        dateSelector: { type: String, default: "" },
        linkAttr: { type: String, default: "href" },

        /* ✅ NEW — Optional CSS selector that scopes the crawler to the
           container holding the tender list.
           Examples: "table", ".table-responsive", "#tenderTable".
           Blank = crawl the whole page (auto-detect). */
        sectionSelector: { type: String, default: "", trim: true },

        absoluteLinks: { type: Boolean, default: true },
        active: { type: Boolean, default: true, index: true },
        renderMode: {
            type: String,
            enum: ["auto", "cheerio", "puppeteer"],
            default: "auto",
        },

        /* ============ Site Directory fields ============ */
        sector: {
            type: String,
            enum: ["banks", "power", "oilgas", "govt"],
            default: "banks",
            index: true,
        },
        portalUrl: { type: String, default: "" },

        /* Popular Tenderers */
        popular: { type: Boolean, default: false, index: true },
        popularShort: { type: String, default: "" },
        popularColor: { type: String, default: "" },
        popularSubtitle: { type: String, default: "" },

        /* Info modal */
        siteInfoSector: { type: String, default: "" },
        siteInfoPortalType: { type: String, default: "" },
        siteInfoContact: { type: String, default: "" },

        /* Crawl stats */
        lastCrawledAt: { type: Date, default: null },
        lastCrawlStatus: {
            type: String,
            enum: ["idle", "success", "error", ""],
            default: "idle",
        },
        lastCrawlError: { type: String, default: "" },
        lastItemCount: { type: Number, default: 0 },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        // ============================================================
        // CREDENTIALS (NEW)
        // ============================================================
        username: { type: String, default: "" },
        password: { type: String, default: "" }, // Note: In production, encrypt this!
        credentialType: { type: String, enum: ["Enlisted", "Open bid"], default: "Enlisted" },
        registeredAs: { type: String, default: "" },
        registeredEmail: { type: String, default: "" },
        registrationRenewal: { type: Date, default: null },
        notes: { type: String, default: "" },
    },
    { timestamps: true },
);

module.exports =
    mongoose.models.SiteSource ||
    mongoose.model("SiteSource", SiteSourceSchema);