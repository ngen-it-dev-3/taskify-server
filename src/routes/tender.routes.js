// src/routes/tender.routes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");

const tenderCtrl = require("../controllers/tender/tender.controller");
const submissionCtrl = require("../controllers/tender/submission.controller");
const securityCtrl = require("../controllers/tender/security.controller");
const docCtrl = require("../controllers/tender/companyDoc.controller");
const overviewCtrl = require("../controllers/tender/overview.controller");
const settingsCtrl = require("../controllers/tender/settings.controller");
const chatCtrl = require("../controllers/tender/tenderChat.controller");

const {
    tenderUpload,
    advertisementUpload,
    companyDocUpload,
    tenderChatUpload,
} = require("../middleware/upload.middleware");

router.use(authenticate);

/* ============================================================
 * STATIC ROUTES — must be BEFORE any /:id
 * ============================================================ */
router.get("/overview", overviewCtrl.overview);
router.get("/overview/upcoming", overviewCtrl.upcomingDeadlines);
router.get("/overview/performance", overviewCtrl.performance);
router.get("/overview/recent-activity", overviewCtrl.recentActivity);

router.get("/submissions/list", submissionCtrl.listSubmissions);
router.get("/submissions/:id", submissionCtrl.getSubmissionDetail);

router.get("/security/list", securityCtrl.listSecurity);
router.get("/security/stats", securityCtrl.securityStats);
router.post("/security", securityCtrl.createSecurity);
router.patch("/security/:id", securityCtrl.updateSecurity);
router.delete("/security/:id", securityCtrl.deleteSecurity);
router.post("/security/:id/notify", securityCtrl.notifySecurity);
router.post("/security/:id/pay", securityCtrl.recordPayment);

router.get("/docs/list", docCtrl.listDocs);
router.get("/docs/counts", docCtrl.docCounts);
router.get("/docs/bundle", docCtrl.listAndCounts);
router.post("/docs/import", docCtrl.importDocsToTender);
router.post("/docs", docCtrl.createDoc);
router.patch("/docs/:id", docCtrl.updateDoc);
router.delete("/docs/:id", docCtrl.deleteDoc);

router.post(
    "/docs/:id/file",
    companyDocUpload.single("file"),
    docCtrl.uploadDocFile,
);
router.post("/docs/:id/renew", docCtrl.renewDoc);

/* ---------- Settings ---------- */
router.get("/settings", settingsCtrl.getSettings);
router.put("/settings", settingsCtrl.updateSettings);

/* ============================================================
 * CRAWL — run the full crawl across all active sites
 * ============================================================ */
router.post("/crawl/run", settingsCtrl.runCrawl);
router.get("/crawl/last", settingsCtrl.getLastCrawl);

/* ============================================================
 * SITE SOURCES (crawler targets)
 *
 * Order matters:
 *   1. Static paths first (POST /sites/preview)
 *   2. Then /:id paths
 * ============================================================ */
router.get("/sites", settingsCtrl.listSites);
router.post("/sites", settingsCtrl.createSite);

/* ✅ Preview an arbitrary URL (does not require a saved site) */
router.post("/sites/preview", settingsCtrl.previewSite);

/* ✅ NEW — Crawl a single saved site immediately (by _id) */
router.post("/sites/:id/crawl", settingsCtrl.crawlSiteNow);

/* ✅ NEW — Preview a saved site using its stored config */
router.post("/sites/:id/test", settingsCtrl.previewSavedSite);

router.put("/sites/:id", settingsCtrl.updateSite);
router.delete("/sites/:id", settingsCtrl.deleteSite);

/* ============================================================
 * TENDER CRUD — root
 * ============================================================ */
router.get("/", tenderCtrl.listTenders);
router.post("/", tenderCtrl.createTender);

/* ============================================================
 * TENDER CHAT (SUPPORT) — scoped /:id
 * Placed BEFORE the generic /:id block for clarity.
 * ============================================================ */
router.get("/chat/inbox", chatCtrl.inbox);
router.get("/:id/chat", chatCtrl.listMessages);
router.get("/:id/chat/unread", chatCtrl.unreadCount);
router.post("/:id/chat", chatCtrl.sendMessage);
router.post(
    "/:id/chat/upload",
    tenderChatUpload.single("file"),
    chatCtrl.uploadChatFile,
);

/* ============================================================
 * SCOPED /:id ROUTES
 * ============================================================ */
router.post("/:id/doc-tasks", tenderCtrl.addDocTask);
router.patch("/:id/doc-tasks/:taskId", tenderCtrl.updateDocTask);
router.delete("/:id/doc-tasks/:taskId", tenderCtrl.deleteDocTask);

/* ✅ NEW — Add Company Docs to Tender Section */
router.post("/:id/add-documents", tenderCtrl.addCompanyDocsToTender);

router.patch("/:id/checklist", tenderCtrl.updateChecklist);

/* ✅ Submission Preparation (package + sections + todos) */
router.patch("/:id/preparation", tenderCtrl.updatePreparation);

router.post("/:id/sections", tenderCtrl.createSection);
router.patch("/:id/sections/:sectionId", tenderCtrl.updateSection);
router.delete("/:id/sections/:sectionId", tenderCtrl.deleteSection);

router.post("/:id/sections/:sectionId/todos", tenderCtrl.addTodo);
router.patch("/:id/sections/:sectionId/todos/:todoId", tenderCtrl.updateTodo);
router.delete("/:id/sections/:sectionId/todos/:todoId", tenderCtrl.deleteTodo);
router.post("/:id/sections/apply-template", tenderCtrl.applySectionTemplate);

/* ✅ Notify Finance for a tender */
router.post("/:id/notify-finance", tenderCtrl.notifyFinance);

router.post(
    "/:id/attachments",
    tenderUpload.single("file"),
    tenderCtrl.uploadAttachment,
);
router.delete("/:id/attachments/:attachmentId", tenderCtrl.deleteAttachment);

router.post(
    "/:id/advertisement",
    advertisementUpload.single("file"),
    tenderCtrl.uploadAdvertisement,
);
router.delete("/:id/advertisement", tenderCtrl.deleteAdvertisement);

/* ============================================================
 * GENERIC /:id — LAST
 * ============================================================ */
router.get("/:id", tenderCtrl.getTender);
router.put("/:id", tenderCtrl.updateTender);
router.patch("/:id/stage", tenderCtrl.changeStage);
router.delete("/:id", tenderCtrl.deleteTender);

module.exports = router;