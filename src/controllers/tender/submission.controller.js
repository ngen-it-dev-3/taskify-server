// src/controllers/tender/submission.controller.js
const Tender = require("../../models/Tender.model");
const TenderDocumentTask = require("../../models/TenderDocumentTask.model");

/* ============================================================
 * Helpers
 * ============================================================ */

function buildChecklist(tender, tasks) {
  const anyInProgress = tasks.some((t) => t.status === "In Progress");
  const anyPending = tasks.some((t) => t.status === "Pending");

  const daysToDeadline = tender.lastDateOfSubmission
    ? Math.max(
      0,
      Math.ceil(
        (new Date(tender.lastDateOfSubmission).getTime() - Date.now()) /
        86400000
      )
    )
    : 0;

  return [
    { id: "c1", label: "Pre-bid meeting", value: "N/A", tone: "neutral" },
    {
      id: "c2",
      label: "Tender security pay order ready",
      value: anyInProgress ? "In progress" : anyPending ? "Pending" : "Ready",
      tone: anyPending ? "warn" : "progress",
    },
    {
      id: "c3",
      label: "Submitted before deadline",
      value: tender.submitted ? "Submitted" : `${daysToDeadline} days remaining`,
      tone: tender.submitted ? "neutral" : "warn",
    },
  ];
}

/**
 * Section ready/total counters, grouped by sectionId.
 * Tasks with empty sectionId belong to the "Unsectioned" bucket.
 */
function computeSectionCounts(tasks) {
  const map = {};
  for (const t of tasks) {
    const key = t.sectionId || "";
    if (!map[key]) map[key] = { ready: 0, total: 0 };
    map[key].total += 1;
    if (t.status === "Done") map[key].ready += 1;
  }
  return map;
}

/**
 * Recompute readiness = % of sections fully ready, then fallback to
 * task-level completion if the tender has no sections.
 */
async function recomputeReadiness(tenderId) {
  const [tender, tasks] = await Promise.all([
    Tender.findById(tenderId).lean(),
    TenderDocumentTask.find({ tenderId }).lean(),
  ]);
  if (!tender) return 0;

  const sections = tender.sections || [];
  let readiness = 0;

  if (sections.length > 0) {
    const counts = computeSectionCounts(tasks);
    let totalSections = sections.length; // ✅ Count ALL sections
    let readySections = 0;

    for (const s of sections) {
      const c = counts[s.id] || { ready: 0, total: 0 };

      // A section is only "ready" if it actually has tasks AND all are Done.
      if (c.total > 0 && c.ready === c.total) {
        readySections += 1;
      }
    }

    // ✅ Progress is now divided by ALL sections, not just ones with tasks.
    readiness = Math.round((readySections / totalSections) * 100);
  } else {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Done").length;
    readiness = total ? Math.round((done / total) * 100) : 0;
  }

  // Update docStatus as a side effect
  const anyInProgress = tasks.some((t) => t.status === "In Progress");
  const anyPending = tasks.some((t) => t.status === "Pending");
  const docStatus =
    readiness === 100
      ? "Complete"
      : anyInProgress
        ? "Docs in progress"
        : anyPending
          ? "Docs pending"
          : tender.docStatus || "";

  await Tender.findByIdAndUpdate(tenderId, { readiness, docStatus });
  return readiness;
}

/* ============================================================
 * LIST — active + submitted tenders
 * ============================================================ */
const listSubmissions = async (req, res) => {
  try {
    const tenders = await Tender.find({
      stage: { $in: ["active", "submitted"] },
    })
      .sort({ lastDateOfSubmission: 1 })
      .lean();

    const ids = tenders.map((t) => t._id);
    const tasks = await TenderDocumentTask.find({
      tenderId: { $in: ids },
    }).lean();

    const tasksByTender = tasks.reduce((acc, t) => {
      const key = String(t.tenderId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

    const rows = tenders.map((t) => {
      const ttasks = tasksByTender[String(t._id)] || [];
      return {
        id: t._id,
        tenderer: t.tenderer,
        mode: t.mode || t.tenderType || "",
        submitted: t.submitted ? "Submitted" : "Not yet",
        status: t.docStatus || "Docs pending",
        readiness: t.readiness ?? 0,
        priority: t.priority || "",
        tenderSecurityPurchased: t.tenderSecurityPurchased || false, // ✅ ADD THIS LINE
        _docTaskCount: ttasks.length,
      };
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("listSubmissions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DETAIL — one tender's submission detail
 * ============================================================ */
const getSubmissionDetail = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id).lean();
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const docTasks = await TenderDocumentTask.find({ tenderId: tender._id })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const deadlineDays = tender.lastDateOfSubmission
      ? Math.max(
        0,
        Math.ceil(
          (new Date(tender.lastDateOfSubmission).getTime() - Date.now()) /
          86400000
        )
      )
      : 0;

    const bidValue = Number(tender.bidValue) || 0;
    const tenderSecurity = Number(tender.tenderSecurityAmount) || 0;
    const performanceSecurity = Number(tender.performanceSecurityAmount) || 0;
    const performanceSecurityPercent = bidValue
      ? Math.round((performanceSecurity / bidValue) * 100)
      : 0;

    const documentsSubmitted = (tender.attachments ?? []).map((a) => ({
      id: String(a._id),
      name: a.name,
      url: a.url ?? "",
      size: a.size ?? 0,
      mimeType: a.mimeType ?? "",
    }));

    const otherParticipants = (tender.otherParticipants ?? []).map((p) => ({
      bidder: p.bidder,
      value: Number(p.value) || 0,
      isUs: !!p.isUs,
    }));

    /* ✅ NEW — section readiness counters */
    const counts = computeSectionCounts(docTasks);

    /* ✅ NEW — expand sections with ready/total + todos sorted by index */
    const sections = (tender.sections || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => {
        const c = counts[s.id] || { ready: 0, total: 0 };
        return {
          id: s.id,
          key: s.key,
          title: s.title,
          description: s.description ?? "",
          portalHint: s.portalHint ?? "",
          order: s.order ?? 0,
          readyCount: c.ready,
          totalCount: c.total,
          todoItems: (s.todoItems || []).map((t) => ({
            id: t.id,
            title: t.title,
            done: !!t.done,
          })),
        };
      });

    res.json({
      success: true,
      data: {
        id: tender._id,
        tenderer: tender.tenderer,
        title: tender.title,
        deadlineDays,
        readiness: tender.readiness ?? 0,

        /* ✅ NEW — package + notes */
        packageMode: tender.packageMode ?? "",
        packageLabel: tender.packageLabel ?? "",
        notes: tender.notes ?? "",
        sections,

        bidSummary: {
          ourBidValue: bidValue,
          tenderSecurity,
          performanceSecurity,
          performanceSecurityPercent,
          currency: tender.currency || "BDT",
        },

        otherParticipants,
        documentsSubmitted,

        docTasks: docTasks.map((t) => ({
          id: t._id,
          sectionId: t.sectionId || "",
          title: t.title,
          owner: t.owner,
          fileName: t.fileName,
          fileUrl: t.fileUrl ?? "",
          status: t.status,
        })),

        checklist: buildChecklist(tender, docTasks),

        info: {
          advertisementFile: tender.advertisementFile,
          advertisementUrl: tender.advertisementUrl ?? "",
          advertisementUploadedBy: tender.advertisementUploadedBy,
          advertisementUploadedAt: tender.advertisementUploadedAt,
          tenderLink: tender.tenderLink,
          recordedBy: tender.recordedBy,
          tenderType: tender.tenderType,
          responsiblePerson: tender.responsiblePerson,
          lastDateOfPurchase: tender.lastDateOfPurchase
            ? new Date(tender.lastDateOfPurchase).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            : undefined,
          lastDateOfSubmission: tender.lastDateOfSubmission
            ? new Date(tender.lastDateOfSubmission).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
            : undefined,
          note: tender.note,
          attachments: (tender.attachments ?? []).map((a) => ({
            _id: String(a._id),
            name: a.name,
            url: a.url,
            size: a.size,
            mimeType: a.mimeType,
          })),
          eligibility: tender.eligibility,
        },
      },
    });
  } catch (error) {
    console.error("getSubmissionDetail error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listSubmissions,
  getSubmissionDetail,
  /* helper — usable by tender.controller.js */
  recomputeReadiness,
};