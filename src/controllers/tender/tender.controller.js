// src/controllers/tender/tender.controller.js
const Tender = require("../../models/Tender.model");
const TenderDocumentTask = require("../../models/TenderDocumentTask.model");
const path = require("path");
const fs = require("fs");
const {
  tenderUploadDir,
  advertisementUploadDir,
} = require("../../middleware/upload.middleware");
const { sendMail } = require("../../utils/mailer");

/* Lazy-require to avoid circular dep issues with submission.controller */
function getRecomputeReadiness() {
  // eslint-disable-next-line global-require
  return require("./submission.controller").recomputeReadiness;
}

/* ============================================================ */
const LIST_FIELDS = [
  "tenderer",
  "title",
  "description",
  "stage",
  "tenderType",
  "draft",
  "currency",
  "tentativeBudget",
  "bidValue",
  "lastDateOfPurchase",
  "lastDateOfSubmission",
  "submittedAt",
  "submitted",
  "lostAt",
  "readiness",
  "docStatus",
  "mode",
  "securityMode",
  "tenderSecurityAmount",
  "tenderSecurityValidity",
  "performanceSecurityAmount",
  "performanceSecurityValidity",
  "owner",
  "departmentId",
  "advertisementFile",
  "advertisementUrl",
  "advertisementUploadedBy",
  "advertisementUploadedAt",
  "attachments",
  "eligibility",
  "eligibilityRequirements",
  "recordedBy",
  "responsiblePerson",
  "tenderLink",
  "note",
  "lossReason",
  "lowestCompliantBidder",
  "lowestCompliantValue",
  "checklist",
  "otherParticipants",
  /* ✅ NEW */
  "packageMode",
  "packageLabel",
  "sections",
  "notes",
  "updatedAt",
  "createdAt",
].join(" ");

/* ============================================================
 * LIST TENDERS
 * ============================================================ */
const listTenders = async (req, res) => {
  try {
    const {
      stage,
      tenderType,
      search,
      includeDrafts,
      page = 1,
      limit = 100,
      withCount = "false",
    } = req.query;

    const query = {};
    if (stage && stage !== "all") query.stage = stage;
    if (tenderType && tenderType !== "all") query.tenderType = tenderType;
    if (includeDrafts !== "true") query.draft = { $ne: true };

    if (search && String(search).trim()) {
      query.$text = { $search: String(search).trim() };
    }

    const lim = Math.min(Math.max(parseInt(limit) || 100, 1), 200);
    const skip = Math.max((parseInt(page) || 1) - 1, 0) * lim;

    const rows = await Tender.find(query)
      .select(LIST_FIELDS)
      .populate("owner", "fullName email profilePhoto")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    const payload = { success: true, data: rows };

    if (withCount === "true") {
      const total = await Tender.countDocuments(query);
      payload.pagination = {
        page: parseInt(page) || 1,
        limit: lim,
        total,
        pages: Math.ceil(total / lim),
      };
    }

    res.json(payload);
  } catch (error) {
    console.error("listTenders error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * GET ONE
 * ============================================================ */
const getTender = async (req, res) => {
  try {
    const [tender, docTasks] = await Promise.all([
      Tender.findById(req.params.id)
        .populate("owner", "fullName email profilePhoto")
        .lean(),
      TenderDocumentTask.find({ tenderId: req.params.id })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
    ]);

    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    res.json({ success: true, data: { ...tender, docTasks } });
  } catch (error) {
    console.error("getTender error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * CREATE TENDER
 * ============================================================ */
const createTender = async (req, res) => {
  try {
    const {
      tenderer,
      title,
      stage = "potential",
      tenderType,
      description,
      tenderLink,
      recordedBy,
      responsiblePerson,
      lastDateOfPurchase,
      lastDateOfSubmission,
      tentativeBudget,
      currency,
      tenderSecurityAmount,
      tenderSecurityValidity,
      performanceSecurityAmount,
      performanceSecurityValidity,
      mode,
      note,
      eligibility,
      draft,
    } = req.body;

    if (!tenderer?.trim() || !title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "tenderer and title are required" });
    }

    const toDate = (v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const tender = await Tender.create({
      tenderer: tenderer.trim(),
      title: title.trim(),
      stage,
      draft: !!draft,
      tenderType: tenderType || "eGP",
      description: description || "",
      tenderLink: tenderLink || "",
      recordedBy: recordedBy || req.user.fullName || "",
      responsiblePerson: responsiblePerson || "",
      lastDateOfPurchase: toDate(lastDateOfPurchase),
      lastDateOfSubmission: toDate(lastDateOfSubmission),
      tentativeBudget: Number(tentativeBudget) || 0,
      currency: currency || "BDT",
      tenderSecurityAmount: Number(tenderSecurityAmount) || 0,
      tenderSecurityValidity: toDate(tenderSecurityValidity),
      performanceSecurityAmount: Number(performanceSecurityAmount) || 0,
      performanceSecurityValidity: toDate(performanceSecurityValidity),
      mode: mode || "",
      note: note || "",
      eligibility: eligibility || "",
      owner: req.user._id,
      departmentId: req.user.departmentId,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      stageHistory: [
        { from: null, to: stage, at: new Date(), by: req.user._id },
      ],
    });

    try {
      const { Client360Service } = require("../../services/client360/client360.service");
      await Client360Service.autoCaptureFromTender(
        tender,
        req.user?._id || req.user?.id
      );
    } catch (e) {
      console.error("[tender.controller] Client 360 auto-capture failed:", e.message);
    }

    res.status(201).json({ success: true, data: tender });
  } catch (error) {
    console.error("createTender error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPDATE TENDER
 * ============================================================ */
const updateTender = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const allowed = [
      "tenderer",
      "title",
      "draft",
      "tenderType",
      "description",
      "tenderLink",
      "recordedBy",
      "responsiblePerson",
      "lastDateOfPurchase",
      "lastDateOfSubmission",
      "tentativeBudget",
      "currency",
      "tenderSecurityAmount",
      "tenderSecurityValidity",
      "performanceSecurityAmount",
      "performanceSecurityValidity",
      "securityMode",
      "mode",
      "readiness",
      "docStatus",
      "advertisementFile",
      "advertisementUrl",
      "advertisementUploadedBy",
      "advertisementUploadedAt",
      "note",
      "eligibility",
      "eligibilityRequirements",
      "attachments",
      "otherParticipants",
      "lossReason",
      "lowestCompliantBidder",
      "lowestCompliantValue",
      /* ✅ NEW */
      "packageMode",
      "packageLabel",
      "sections",
      "notes",
      "priority",
      "tenderSecurityPurchased",
    ];

    for (const k of allowed) {
      if (req.body[k] !== undefined) tender[k] = req.body[k];
    }
    tender.updatedBy = req.user._id;

    await tender.save();
    res.json({ success: true, data: tender });
  } catch (error) {
    console.error("updateTender error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * CHANGE STAGE
 * ============================================================ */
const changeStage = async (req, res) => {
  try {
    const { stage, note, lossReason } = req.body;
    if (!stage) {
      return res
        .status(400)
        .json({ success: false, message: "stage is required" });
    }

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const fromStage = tender.stage;
    if (fromStage === stage) {
      return res.json({ success: true, data: tender });
    }

    tender.stage = stage;
    tender.updatedBy = req.user._id;

    if (stage === "submitted") {
      tender.submitted = true;
      tender.submittedAt = new Date();
    }
    if (stage === "lost") {
      tender.lostAt = new Date();
      if (lossReason) tender.lossReason = lossReason;
    }
    if (stage === "won") {
      tender.wonAt = new Date();
    }

    tender.stageHistory.push({
      from: fromStage,
      to: stage,
      at: new Date(),
      by: req.user._id,
      note: note || "",
    });

    await tender.save();

    if (stage === "won" && fromStage !== "won") {
      const userId = req.user?._id || req.user?.id;
      const userName = req.user?.fullName || req.user?.name || req.user?.email;

      try {
        const { SalesCrmService } = require("../../services/salesCrm/salesCrm.service");
        await SalesCrmService.pushFromTender({ tender, userId, userName });
      } catch (e) {
        console.error("[changeStage] pushFromTender failed:", e.message);
      }

      try {
        const { SalesOrderService } = require("../../services/salesOrder/salesOrder.service");
        await SalesOrderService.createFromWon({
          source: "tender",
          tender,
          userId,
        });
      } catch (e) {
        console.error("[changeStage] Sales Order creation failed:", e.message);
      }
    }

    res.json({ success: true, data: tender });
  } catch (error) {
    console.error("changeStage error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DELETE TENDER
 * ============================================================ */
const deleteTender = async (req, res) => {
  try {
    const tender = await Tender.findByIdAndDelete(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }
    await TenderDocumentTask.deleteMany({ tenderId: tender._id });
    res.json({ success: true, message: "Tender deleted" });
  } catch (error) {
    console.error("deleteTender error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DOCUMENT TASKS
 * ============================================================ */
const addDocTask = async (req, res) => {
  try {
    const { title, owner, status, fileName, sectionId } = req.body; // ✅ MUST include sectionId here
    if (!title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "title is required" });
    }

    const tender = await Tender.findById(req.params.id).select("_id").lean();
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const count = await TenderDocumentTask.countDocuments({
      tenderId: tender._id,
      sectionId: sectionId || "",
    });

    const task = await TenderDocumentTask.create({
      tenderId: tender._id,
      sectionId: sectionId || "", // ✅ MUST save it to the database!
      title: title.trim(),
      owner: owner || "",
      status: status || "Pending",
      fileName: fileName || "No file uploaded yet",
      order: count,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    // Recompute readiness
    try {
      await getRecomputeReadiness()(tender._id);
    } catch (e) {
      console.warn("[addDocTask] readiness recompute failed:", e.message);
    }

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("addDocTask error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDocTask = async (req, res) => {
  try {
    const task = await TenderDocumentTask.findById(req.params.taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const allowed = [
      "title",
      "owner",
      "status",
      "fileName",
      "fileUrl",
      "order",
      "sectionId",
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) task[k] = req.body[k];
    }
    task.updatedBy = req.user._id;
    await task.save();

    try {
      await getRecomputeReadiness()(task.tenderId);
    } catch (e) {
      console.warn("[updateDocTask] readiness recompute failed:", e.message);
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error("updateDocTask error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDocTask = async (req, res) => {
  try {
    const task = await TenderDocumentTask.findByIdAndDelete(req.params.taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    try {
      await getRecomputeReadiness()(task.tenderId);
    } catch (e) {
      console.warn("[deleteDocTask] readiness recompute failed:", e.message);
    }

    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    console.error("deleteDocTask error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPDATE SUBMISSION CHECKLIST
 * ============================================================ */
const updateChecklist = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res
        .status(400)
        .json({ success: false, message: "items[] is required" });
    }

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    tender.checklist = items.map((it) => ({
      id: String(it.id),
      label: String(it.label),
      checked: !!it.checked,
      isCustom: !!it.isCustom,
    }));
    tender.updatedBy = req.user._id;

    await tender.save();
    res.json({ success: true, data: tender.checklist });
  } catch (error) {
    console.error("updateChecklist error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPLOAD ATTACHMENT
 * ============================================================ */
const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      try { fs.unlinkSync(req.file.path); } catch { }
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const url = `/uploads/tenders/${req.file.filename}`;

    const attachment = {
      name: req.file.originalname,
      url,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
    };

    tender.attachments.push(attachment);
    tender.updatedBy = req.user._id;
    await tender.save();

    const created = tender.attachments[tender.attachments.length - 1];
    console.log("[uploadAttachment] ✅ saved:", created._id, "→", created.url);

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error("uploadAttachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DELETE ATTACHMENT
 * ============================================================ */
const deleteAttachment = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const idx = tender.attachments.findIndex(
      (a) => String(a._id) === req.params.attachmentId,
    );
    if (idx === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Attachment not found" });
    }

    try {
      const fileUrl = tender.attachments[idx].url || "";
      const filename = path.basename(fileUrl);
      const full = path.join(tenderUploadDir, filename);
      if (filename && fs.existsSync(full)) fs.unlinkSync(full);
    } catch (err) {
      console.warn("Could not delete file from disk:", err.message);
    }

    tender.attachments.splice(idx, 1);
    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({ success: true, message: "Attachment removed" });
  } catch (error) {
    console.error("deleteAttachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPLOAD ADVERTISEMENT
 * ============================================================ */
const uploadAdvertisement = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      try { fs.unlinkSync(req.file.path); } catch { }
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    if (tender.advertisementUrl) {
      try {
        const prev = path.basename(tender.advertisementUrl);
        const full = path.join(advertisementUploadDir, prev);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) {
        console.warn("Could not delete old advertisement:", err.message);
      }
    }

    const url = `/uploads/tender-advertisements/${req.file.filename}`;

    tender.advertisementFile = req.file.originalname;
    tender.advertisementUrl = url;
    tender.advertisementUploadedBy = `${req.user.fullName} · just now`;
    tender.advertisementUploadedAt = new Date();
    tender.updatedBy = req.user._id;
    await tender.save();

    console.log("[uploadAdvertisement] ✅ saved:", url);

    res.status(201).json({
      success: true,
      data: {
        advertisementFile: tender.advertisementFile,
        advertisementUrl: tender.advertisementUrl,
        advertisementUploadedBy: tender.advertisementUploadedBy,
        advertisementUploadedAt: tender.advertisementUploadedAt,
      },
    });
  } catch (error) {
    console.error("uploadAdvertisement error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DELETE ADVERTISEMENT
 * ============================================================ */
const deleteAdvertisement = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    if (tender.advertisementUrl) {
      try {
        const prev = path.basename(tender.advertisementUrl);
        const full = path.join(advertisementUploadDir, prev);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) {
        console.warn("Could not delete advertisement from disk:", err.message);
      }
    }

    tender.advertisementFile = "";
    tender.advertisementUrl = "";
    tender.advertisementUploadedBy = "";
    tender.advertisementUploadedAt = null;
    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({ success: true, message: "Advertisement removed" });
  } catch (error) {
    console.error("deleteAdvertisement error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * ✅ NEW — PREPARATION (packageMode / packageLabel / notes)
 * ============================================================ */
const updatePreparation = async (req, res) => {
  try {
    const { packageMode, packageLabel, notes } = req.body || {};
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    if (packageMode !== undefined) {
      const allowed = ["section_by_section", "single_package", "portal", ""];
      if (!allowed.includes(packageMode)) {
        return res.status(400).json({
          success: false,
          message: `packageMode must be one of: ${allowed.join(", ")}`,
        });
      }
      tender.packageMode = packageMode;
    }
    if (packageLabel !== undefined) tender.packageLabel = String(packageLabel);
    if (notes !== undefined) tender.notes = String(notes);
    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({
      success: true,
      data: {
        packageMode: tender.packageMode,
        packageLabel: tender.packageLabel,
        notes: tender.notes,
        sections: tender.sections,
      },
    });
  } catch (error) {
    console.error("updatePreparation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * ✅ NEW — SECTIONS CRUD
 * ============================================================ */
function newId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

const createSection = async (req, res) => {
  try {
    const { key, title, description, portalHint } = req.body || {};
    if (!title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "title is required" });
    }
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const order = tender.sections?.length || 0;
    const section = {
      id: newId(),
      key: key?.trim() || `section_${order}`,
      title: title.trim(),
      description: description || "",
      portalHint: portalHint || "",
      order,
      todoItems: [],
    };
    tender.sections.push(section);
    tender.updatedBy = req.user._id;
    await tender.save();

    res.status(201).json({ success: true, data: section });
  } catch (error) {
    console.error("createSection error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSection = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { title, description, portalHint, order, key } = req.body || {};
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const section = tender.sections.find((s) => s.id === sectionId);
    if (!section) {
      return res
        .status(404)
        .json({ success: false, message: "Section not found" });
    }

    if (title !== undefined) section.title = String(title);
    if (description !== undefined) section.description = String(description);
    if (portalHint !== undefined) section.portalHint = String(portalHint);
    if (order !== undefined) section.order = Number(order);
    if (key !== undefined) section.key = String(key);

    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({ success: true, data: section });
  } catch (error) {
    console.error("updateSection error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSection = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const before = tender.sections.length;
    tender.sections = tender.sections.filter((s) => s.id !== sectionId);
    if (tender.sections.length === before) {
      return res
        .status(404)
        .json({ success: false, message: "Section not found" });
    }

    tender.updatedBy = req.user._id;
    await tender.save();

    /* Orphan tasks under this section get unlinked to "Unsectioned" */
    await TenderDocumentTask.updateMany(
      { tenderId: tender._id, sectionId },
      { $set: { sectionId: "" } },
    );

    try {
      await getRecomputeReadiness()(tender._id);
    } catch (e) { /* ignore */ }

    res.json({ success: true, message: "Section removed" });
  } catch (error) {
    console.error("deleteSection error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * ✅ NEW — TODOS CRUD
 * ============================================================ */
const addTodo = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { title } = req.body || {};
    if (!title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "title is required" });
    }
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }
    const section = tender.sections.find((s) => s.id === sectionId);
    if (!section) {
      return res
        .status(404)
        .json({ success: false, message: "Section not found" });
    }

    const todo = { id: newId(), title: title.trim(), done: false };
    section.todoItems.push(todo);
    tender.updatedBy = req.user._id;
    await tender.save();

    res.status(201).json({ success: true, data: todo });
  } catch (error) {
    console.error("addTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateTodo = async (req, res) => {
  try {
    const { sectionId, todoId } = req.params;
    const { title, done } = req.body || {};
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }
    const section = tender.sections.find((s) => s.id === sectionId);
    if (!section) {
      return res
        .status(404)
        .json({ success: false, message: "Section not found" });
    }
    const todo = section.todoItems.find((t) => t.id === todoId);
    if (!todo) {
      return res
        .status(404)
        .json({ success: false, message: "Todo not found" });
    }
    if (title !== undefined) todo.title = String(title);
    if (done !== undefined) todo.done = !!done;

    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({ success: true, data: todo });
  } catch (error) {
    console.error("updateTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTodo = async (req, res) => {
  try {
    const { sectionId, todoId } = req.params;
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }
    const section = tender.sections.find((s) => s.id === sectionId);
    if (!section) {
      return res
        .status(404)
        .json({ success: false, message: "Section not found" });
    }
    const before = section.todoItems.length;
    section.todoItems = section.todoItems.filter((t) => t.id !== todoId);
    if (section.todoItems.length === before) {
      return res
        .status(404)
        .json({ success: false, message: "Todo not found" });
    }
    tender.updatedBy = req.user._id;
    await tender.save();

    res.json({ success: true, message: "Todo removed" });
  } catch (error) {
    console.error("deleteTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * NOTIFY FINANCE — unchanged
 * ============================================================ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const notifyFinance = async (req, res) => {
  try {
    const { emails, note } = req.body || {};

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "emails[] is required and must not be empty",
      });
    }

    const tender = await Tender.findById(req.params.id).lean();
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const valid = emails
      .map((e) => String(e).trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (valid.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid email addresses provided",
      });
    }

    const deadline = tender.lastDateOfSubmission
      ? new Date(tender.lastDateOfSubmission).toLocaleString("en-GB")
      : "—";

    const CLIENT_URL = process.env.CLIENT_URL || "https://taskify-server-5gat.onrender.com";
    const submissionUrl = `${CLIENT_URL}/tenders/submissions`;

    const subject = `[Tender] Banking docs pending — ${tender.tenderer}`;

    const noteBlock = note
      ? `<div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-left:3px solid #a97400;border-radius:4px">
             <strong>Note from ${escapeHtml(req.user?.fullName || "team")}:</strong>
             <div style="margin-top:4px;color:#334155">${escapeHtml(note)}</div>
         </div>`
      : "";

    const html = `
<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Docs Pending</title></head>
  <body style="margin:0;padding:0;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f0;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e5e0d5;overflow:hidden;">
          <tr><td style="background:#a97400;padding:22px 28px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fce9c2;">Tender Dashboard</p>
            <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">Documents Pending</h1>
          </td></tr>
          <tr><td style="padding:24px 28px 8px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Hi Finance Team,</p>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#334155;">The following tender is awaiting <strong>documents</strong> — please review and action at the earliest.</p>
          </td></tr>
          <tr><td style="padding:18px 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e0d5;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:14px 16px;background:#faf7f0;border-bottom:1px solid #e5e0d5;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Tender Details</td></tr>
              <tr><td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;width:40%;">Tenderer</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1ede2;">${escapeHtml(tender.tenderer || "—")}</td></tr>
                  <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;">Title</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1ede2;">${escapeHtml(tender.title || "—")}</td></tr>
                  <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;">Submission Deadline</td><td style="padding:12px 16px;font-size:13px;color:#b91c1c;font-weight:700;border-bottom:1px solid #f1ede2;">${deadline}</td></tr>
                  <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;">Requested By</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(req.user?.fullName || "—")}</td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
          ${noteBlock ? `<tr><td style="padding:18px 28px 0;">${noteBlock}</td></tr>` : ""}
          <tr><td style="padding:22px 28px 0;" align="left">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">
              <a href="${submissionUrl}" target="_blank" style="display:inline-block;background-color:#a97400;border-radius:4px;color:#ffffff !important;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;padding:10px 20px;text-decoration:none;">View Submission</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:24px 28px 26px;">
            <hr style="border:none;border-top:1px solid #e5e0d5;margin:0 0 14px;" />
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">Automated notification from the Tender Dashboard.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const results = await Promise.allSettled(
      valid.map((email) => sendMail({ to: email, subject, html })),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;

    return res.json({
      success: true,
      message:
        failed === 0
          ? `Notified ${sent} recipient${sent === 1 ? "" : "s"}`
          : `Notified ${sent} of ${results.length} (${failed} failed)`,
      data: { recipients: valid, sent, failed },
    });
  } catch (error) {
    console.error("notifyFinance error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
};

const applySectionTemplate = async (req, res) => {
  try {
    const { mode } = req.body;
    const tender = await Tender.findById(req.params.id);
    if (!tender) return res.status(404).json({ success: false, message: "Tender not found" });

    const oldSections = tender.sections || [];

    // 1. Define templates
    let newSections = [];
    if (mode === "portal" || mode === "section_by_section") {
      newSections = [
        { key: "company_eligibility", title: "Company & eligibility", description: "Legal documents, company profile and eligibility declarations.", portalHint: 'Upload in the portal under "Company & eligibility"' },
        { key: "technical", title: "Technical", description: "Compliance statement, datasheets, work orders, CVs and partner certificates.", portalHint: 'Upload in the portal under "Technical"' },
        { key: "financial", title: "Financial / price", description: "Price schedule, commercial offer and banking documents.", portalHint: 'Upload in the portal under "Financial / price"' },
        { key: "tender_security", title: "Tender security", description: "Pay order, bank guarantee, or bid security.", portalHint: 'Upload in the portal under "Tender security"' },
        { key: "review", title: "Review & package", description: "Final review, sign-off, and submission package.", portalHint: 'Confirm all documents before final submission' }
      ];
    } else if (mode === "single_package") {
      newSections = [
        { key: "company_eligibility", title: "Company & eligibility", description: "Legal documents, company profile and eligibility declarations.", portalHint: "Separate file: Bangladesh_Meteorological_Dept_technical.pdf" },
        { key: "technical", title: "Technical", description: "Compliance statement, datasheets, work orders, CVs and partner certificates.", portalHint: "Separate file: Bangladesh_Meteorological_Dept_technical.pdf" },
        { key: "financial", title: "Financial / price", description: "Price schedule, commercial offer and banking documents.", portalHint: "Separate file: Bangladesh_Meteorological_Dept_financial.pdf" },
        { key: "review", title: "Review & package", description: "Final review, sign-off, and submission package.", portalHint: 'Confirm all documents before final submission' }
      ];
    } else if (mode === "rfq") {
      newSections = [
        { key: "company_eligibility", title: "Company & eligibility", description: "Legal documents, company profile and eligibility declarations.", portalHint: 'Upload in the portal under "Company & eligibility"' },
        { key: "technical", title: "Technical", description: "Compliance statement, datasheets, work orders, CVs and partner certificates.", portalHint: "Included in the technical response" },
        { key: "review", title: "Review & package", description: "Final review, sign-off, and submission package.", portalHint: 'Confirm all documents before final submission' }
      ];
    }

    // 2. Map old tasks to new sections based on `key`
    const oldKeyToId = {};
    oldSections.forEach(s => { oldKeyToId[s.key] = s.id; });

    // 3. Format new sections
    const formattedSections = newSections.map((s, i) => ({
      ...s,
      id: Date.now().toString(36) + "-" + i,
      order: i,
      todoItems: []
    }));

    // 4. Update tasks that match old keys to the new section IDs
    for (const newSec of formattedSections) {
      const oldId = oldKeyToId[newSec.key];
      if (oldId) {
        await TenderDocumentTask.updateMany(
          { tenderId: tender._id, sectionId: oldId },
          { $set: { sectionId: newSec.id } }
        );
      }
    }

    tender.sections = formattedSections;
    tender.packageMode = mode;

    if (mode === "portal" || mode === "section_by_section") tender.packageLabel = "Local e-procurement portal — section by section";
    if (mode === "single_package") tender.packageLabel = "International — separate Technical and Financial files";
    if (mode === "rfq") tender.packageLabel = "RFQ / EOI — initial level (technical and datasheets)";

    // ✅ FIX: Force the score to reset to 0 immediately before saving
    tender.readiness = 0;
    tender.docStatus = "Docs pending";

    await tender.save();

    // Unlink tasks that no longer have a matching section
    const validSectionIds = formattedSections.map(s => s.id);
    await TenderDocumentTask.updateMany(
      { tenderId: tender._id, sectionId: { $nin: validSectionIds, $ne: "" } },
      { $set: { sectionId: "" } }
    );

    // ✅ FIX: Run the calculation and wait for it to finish
    try {
      await getRecomputeReadiness()(tender._id);
    } catch (e) {
      console.warn("Failed to recompute after template switch:", e);
    }

    // ✅ FIX: Fetch the absolute latest version of the tender to send back to the frontend
    const updatedTender = await Tender.findById(tender._id).lean();

    res.json({ success: true, data: updatedTender });
  } catch (error) {
    console.error("applySectionTemplate error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listTenders,
  getTender,
  createTender,
  updateTender,
  changeStage,
  deleteTender,
  addDocTask,
  updateDocTask,
  deleteDocTask,
  updateChecklist,
  uploadAttachment,
  deleteAttachment,
  uploadAdvertisement,
  deleteAdvertisement,
  notifyFinance,
  /* ✅ NEW */
  applySectionTemplate,
  updatePreparation,
  createSection,
  updateSection,
  deleteSection,
  addTodo,
  updateTodo,
  deleteTodo,
};