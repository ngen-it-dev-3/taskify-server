// src/controllers/tender/settings.controller.js
const TenderSettings = require("../../models/TenderSettings.model");
const SiteSource = require("../../models/SiteSource.model");
const { runCrawlInternal } = require("../../services/crawlScheduler.service");
const { crawlOne } = require("../../services/tenderCrawler.service");

/* ============================================================
 * GET — one settings doc, or defaults
 * ============================================================ */
const getSettings = async (_req, res) => {
    try {
        let doc = await TenderSettings.findOne().lean();
        if (!doc) {
            const created = await TenderSettings.create({});
            doc = created.toObject();
        }
        res.json({ success: true, data: doc });
    } catch (error) {
        console.error("getSettings error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/* ============================================================
 * UPDATE
 * ============================================================ */
const updateSettings = async (req, res) => {
    try {
        const allowed = [
            "sectors",
            "customSectors",
            "productLines",
            "customProductLines",
            "valueMin",
            "valueMax",
            "securityMin",
            "securityMax",
            "performanceMin",
            "performanceMax",
            "tenderTypes",
            "customTenderTypes",
            "crawlTime",
            "customRangeNote",
            "notificationRecipientIds",
        ];

        const patch = {};
        for (const k of allowed) {
            if (req.body[k] !== undefined) patch[k] = req.body[k];
        }
        patch.updatedBy = req.user._id;

        const doc = await TenderSettings.findOneAndUpdate({}, patch, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }).lean();

        res.json({ success: true, data: doc });
    } catch (error) {
        console.error("updateSettings error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/* ============================================================
 * GET LAST CRAWL
 * ============================================================ */
const getLastCrawl = async (_req, res) => {
    try {
        const doc = await TenderSettings.findOne().lean();
        res.json({ success: true, data: doc?.lastCrawl ?? null });
    } catch (error) {
        console.error("getLastCrawl error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/* ============================================================
 * RUN CRAWL — HTTP handler (delegates to the shared service)
 * ============================================================ */
const runCrawl = async (req, res) => {
    try {
        const result = await runCrawlInternal({ userId: req.user?._id || null });
        res.json({
            success: true,
            message: "Crawl complete",
            data: result,
        });
    } catch (error) {
        console.error("runCrawl error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/* ============================================================
 * SITE SOURCE CRUD
 * ============================================================ */
const listSites = async (_req, res) => {
    try {
        const sites = await SiteSource.find({}).sort({ name: 1 }).lean();
        res.json({ success: true, data: sites });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ============================================================
 * CREATE SITE
 *
 * Selectors are now OPTIONAL — if listSelector is empty the crawler
 * auto-detects the page structure at crawl time.
 *
 * ✅ NEW — `sectionSelector` lets the caller scope the crawl to a
 * specific container (e.g. "table" or ".tender-list").
 * ============================================================ */
const createSite = async (req, res) => {
    try {
        const {
            name,
            url,
            /* selectors — all optional now */
            listSelector,
            titleSelector,
            linkSelector,
            dateSelector,
            linkAttr,
            /* ✅ NEW — optional section selector */
            sectionSelector,
            /* engine */
            renderMode,
            /* site directory */
            sector,
            portalUrl,
            popular,
            popularShort,
            popularColor,
            popularSubtitle,
            siteInfoSector,
            siteInfoPortalType,
            siteInfoContact,
        } = req.body;

        if (!name?.trim() || !url?.trim()) {
            return res.status(400).json({
                success: false,
                message: "name and url are required",
            });
        }

        const domain = (() => {
            try {
                return new URL(url).hostname;
            } catch {
                return "";
            }
        })();

        const site = await SiteSource.create({
            name: name.trim(),
            url: url.trim(),
            domain,

            /* Selectors — empty string means "auto-detect" */
            listSelector: listSelector?.trim() || "",
            titleSelector: titleSelector?.trim() || "",
            linkSelector: linkSelector?.trim() || "",
            dateSelector: dateSelector?.trim() || "",
            linkAttr: linkAttr?.trim() || "href",

            /* ✅ Persist the section selector (trimmed) */
            sectionSelector: (sectionSelector || "").trim(),

            /* Engine — default is auto */
            renderMode: renderMode || "auto",

            absoluteLinks: true,
            active: true, // always active on create

            sector: sector || "banks",
            portalUrl: portalUrl || url,
            popular: !!popular,
            popularShort: popularShort || "",
            popularColor: popularColor || "#1F3864",
            popularSubtitle: popularSubtitle || "",
            siteInfoSector: siteInfoSector || "",
            siteInfoPortalType: siteInfoPortalType || "",
            siteInfoContact: siteInfoContact || "",

            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        res.status(201).json({ success: true, data: site });
    } catch (err) {
        console.error("createSite error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ============================================================
 * UPDATE SITE
 *
 * ✅ NEW — trims `sectionSelector` if present in the payload.
 * ============================================================ */
const updateSite = async (req, res) => {
    try {
        const patch = { ...req.body, updatedBy: req.user._id };

        // Trim the section selector when provided as a string
        if (typeof patch.sectionSelector === "string") {
            patch.sectionSelector = patch.sectionSelector.trim();
        }

        const site = await SiteSource.findByIdAndUpdate(
            req.params.id,
            patch,
            { new: true, runValidators: true },
        );
        if (!site) {
            return res
                .status(404)
                .json({ success: false, message: "Site not found" });
        }
        res.json({ success: true, data: site });
    } catch (err) {
        console.error("updateSite error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ============================================================
 * DELETE SITE
 * ============================================================ */
const deleteSite = async (req, res) => {
    try {
        await SiteSource.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Site deleted" });
    } catch (err) {
        console.error("deleteSite error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ============================================================
 * PREVIEW — fetch & parse without saving
 *
 * Only `url` is required. If selectors are omitted, the crawler
 * auto-detects them and returns what it found via
 * `detectedSelectors`.
 *
 * ✅ NEW — forwards `sectionSelector` to the crawler and returns
 * `effectiveSectionSelector` so the UI can show what was used.
 * ============================================================ */
const previewSite = async (req, res) => {
    try {
        const {
            url,
            listSelector,
            titleSelector,
            linkSelector,
            dateSelector,
            linkAttr,
            renderMode,
            sectionSelector, // ✅ NEW
        } = req.body;

        if (!url || !url.trim()) {
            return res.status(400).json({
                success: false,
                message: "url is required",
            });
        }

        const tempSource = {
            _id: null,
            name: "Preview",
            url: url.trim(),
            listSelector: listSelector?.trim() || "",
            titleSelector: titleSelector?.trim() || "",
            linkSelector: linkSelector?.trim() || "",
            dateSelector: dateSelector?.trim() || "",
            linkAttr: linkAttr?.trim() || "href",
            /* ✅ Forward the section selector */
            sectionSelector: (sectionSelector || "").trim(),
            absoluteLinks: true,
            renderMode: renderMode || "auto",
        };

        const r = await crawlOne(tempSource);

        /* Surface the observability fields to the client */
        return res.json({
            success: r.ok,
            data: {
                ...r,
                effectiveMode: r.effectiveMode,
                fellBack: r.fellBack,
                detectedSelectors: r.detectedSelectors ?? null,
                /* ✅ Echo back what the crawler actually used */
                effectiveSectionSelector: r.effectiveSectionSelector ?? null,
            },
        });
    } catch (err) {
        console.error("previewSite error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
/* ============================================================
 * CRAWL ONE SAVED SITE NOW — POST /sites/:id/crawl
 * ============================================================ */
const crawlSiteNow = async (req, res) => {
    try {
        const site = await SiteSource.findById(req.params.id).lean();
        if (!site) {
            return res
                .status(404)
                .json({ success: false, message: "Site not found" });
        }

        // Run the crawler once against this site
        const r = await crawlOne(site);

        return res.json({
            success: r.ok,
            data: {
                ...r,
                effectiveMode: r.effectiveMode ?? null,
                fellBack: r.fellBack ?? false,
                detectedSelectors: r.detectedSelectors ?? null,
                effectiveSectionSelector: r.effectiveSectionSelector ?? null,
            },
        });
    } catch (err) {
        console.error("crawlSiteNow error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ============================================================
 * PREVIEW ONE SAVED SITE — POST /sites/:id/test
 * Uses the site's stored config (URL, sectionSelector, etc.)
 * ============================================================ */
const previewSavedSite = async (req, res) => {
    try {
        const site = await SiteSource.findById(req.params.id).lean();
        if (!site) {
            return res
                .status(404)
                .json({ success: false, message: "Site not found" });
        }

        const r = await crawlOne(site);

        return res.json({
            success: r.ok,
            data: {
                ...r,
                effectiveMode: r.effectiveMode ?? null,
                fellBack: r.fellBack ?? false,
                detectedSelectors: r.detectedSelectors ?? null,
                effectiveSectionSelector: r.effectiveSectionSelector ?? null,
            },
        });
    } catch (err) {
        console.error("previewSavedSite error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getLastCrawl,
    runCrawl,
    crawlSiteNow,
    previewSavedSite,
    listSites,
    createSite,
    updateSite,
    deleteSite,
    previewSite,
};