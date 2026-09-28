// src/controllers/tender/companyDoc.controller.js
const path = require("path");
const fs = require("fs");
const CompanyDocument = require("../../models/CompanyDocument.model");
const {
  companyDocUploadDir,
} = require("../../middleware/upload.middleware");

/* ============================================================
 * HELPERS
 * ============================================================ */
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function computeStatus(doc) {
  if (!doc.validUntil) {
    return {
      ...doc,
      status: doc.status || "Valid",
      action: doc.action === "Renew" ? "View" : doc.action || "View",
    };
  }
  const now = Date.now();
  const diffDays = Math.ceil(
    (new Date(doc.validUntil).getTime() - now) / 86400000
  );
  if (diffDays < 0) return { ...doc, status: "Expired", action: "Renew" };
  if (diffDays <= 30) return { ...doc, status: "Expiring Soon", action: "Renew" };
  return {
    ...doc,
    status: "Valid",
    action: doc.action === "Renew" ? "View" : doc.action || "View",
  };
}

/* ============================================================
 * ⭐ FILTER HELPERS — Numeric comparison
 * ============================================================ */

/**
 * Parse a duration filter like "3+ Yrs" → 3
 */
function parseDurationFilter(filter) {
  if (!filter || filter === "all") return 0;
  const m = String(filter).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Parse a volume filter like "৳10L+" → 1000000
 * ৳ = BDT
 * L = Lakh = 100,000
 * Cr = Crore = 10,000,000
 * K = Thousand = 1,000
 */
function parseVolumeFilter(filter) {
  if (!filter || filter === "all") return 0;
  const clean = String(filter).replace(/[৳$,+\s]/g, "");
  const m = clean.match(/^(\d+(?:\.\d+)?)(L|Cr|K)?$/i);
  if (!m) return 0;
  const value = Number(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "cr") return value * 10_000_000;
  if (unit === "l") return value * 100_000;
  if (unit === "k") return value * 1_000;
  return value;
}

/**
 * Extract years from an entry string like "92+ Yrs" → 92
 */
function parseEntryYears(raw) {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Extract amount from an entry string like "৳70L+" → 7,000,000
 */
function parseEntryVolume(raw) {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  return parseVolumeFilter(String(raw));
}

/**
 * Given a document, extract its duration number (years).
 * Tries: chips array → duration field → yearsOfExperience field
 */
function extractDocYears(doc) {
  if (!doc) return 0;

  // 1. Direct field
  if (doc.duration !== undefined && doc.duration !== null) {
    return parseEntryYears(doc.duration);
  }
  if (doc.yearsOfExperience !== undefined && doc.yearsOfExperience !== null) {
    return parseEntryYears(doc.yearsOfExperience);
  }

  // 2. From chips array — find chip matching /Yr|year/i
  const chips = Array.isArray(doc.chips) ? doc.chips : [];
  const durationChip = chips.find((c) => /Yr|year/i.test(String(c)));
  if (durationChip) return parseEntryYears(durationChip);

  return 0;
}

/**
 * Given a document, extract its volume amount.
 * Tries: chips array → volume field → projectVolume field
 */
function extractDocVolume(doc) {
  if (!doc) return 0;

  // 1. Direct field
  if (doc.volume !== undefined && doc.volume !== null) {
    return parseEntryVolume(doc.volume);
  }
  if (doc.projectVolume !== undefined && doc.projectVolume !== null) {
    return parseEntryVolume(doc.projectVolume);
  }

  // 2. From chips array — find chip matching currency or L+/Cr
  const chips = Array.isArray(doc.chips) ? doc.chips : [];
  const volumeChip = chips.find((c) => /[৳$]|L\+|Cr/i.test(String(c)));
  if (volumeChip) return parseEntryVolume(volumeChip);

  return 0;
}

/**
 * Build the MongoDB query.
 * Sector is exact chip match, duration + volume are numeric filters applied in-memory.
 */
function buildQuery({ category, sector }) {
  const query = {};
  if (category && category !== "all") query.category = category;
  if (sector && sector !== "all") query.chips = sector;
  return query;
}

/* Projection for list views */
const LIST_PROJECTION = "-importedInto -createdBy -updatedBy -__v";

/* ============================================================
 * LIST — category + optional filters
 * GET /api/v1/tenders/docs/list?category=legal
 * ============================================================ */
const listDocs = async (req, res) => {
  try {
    const { category, sector, duration, volume, status } = req.query;

    const query = buildQuery({ category, sector });

    // Fetch matching docs
    let rows = await CompanyDocument.find(query, LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();

    // ⭐ Apply duration filter numerically
    if (duration && duration !== "all") {
      const required = parseDurationFilter(duration);
      rows = rows.filter((d) => extractDocYears(d) >= required);
    }

    // ⭐ Apply volume filter numerically
    if (volume && volume !== "all") {
      const required = parseVolumeFilter(volume);
      rows = rows.filter((d) => extractDocVolume(d) >= required);
    }

    let enriched = rows.map(computeStatus);

    if (status && status !== "all") {
      const map = {
        expired: "Expired",
        expiring: "Expiring Soon",
        valid: "Valid",
      };
      const target = map[status];
      if (target) enriched = enriched.filter((d) => d.status === target);
    }

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error("listDocs error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * COMBINED list + counts
 * GET /api/v1/tenders/docs/bundle?category=legal
 * ============================================================ */
const listAndCounts = async (req, res) => {
  try {
    const { category, sector, duration, volume, status } = req.query;

    const query = buildQuery({ category, sector });

    /* Parallel: list + counts */
    const [rawRows, countsAgg] = await Promise.all([
      CompanyDocument.find(query, LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .lean(),
      CompanyDocument.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    // ⭐ Apply duration + volume numeric filters
    let rows = rawRows;
    if (duration && duration !== "all") {
      const required = parseDurationFilter(duration);
      rows = rows.filter((d) => extractDocYears(d) >= required);
    }
    if (volume && volume !== "all") {
      const required = parseVolumeFilter(volume);
      rows = rows.filter((d) => extractDocVolume(d) >= required);
    }

    let enriched = rows.map(computeStatus);

    if (status && status !== "all") {
      const map = {
        expired: "Expired",
        expiring: "Expiring Soon",
        valid: "Valid",
      };
      const target = map[status];
      if (target) enriched = enriched.filter((d) => d.status === target);
    }

    const counts = { legal: 0, profiles: 0, experience: 0, certificates: 0 };
    countsAgg.forEach((c) => {
      if (counts[c._id] !== undefined) counts[c._id] = c.count;
    });

    res.json({ success: true, data: { list: enriched, counts } });
  } catch (error) {
    console.error("listAndCounts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * COUNTS ONLY (legacy)
 * ============================================================ */
const docCounts = async (_req, res) => {
  try {
    const rows = await CompanyDocument.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const counts = { legal: 0, profiles: 0, experience: 0, certificates: 0 };
    rows.forEach((r) => {
      if (counts[r._id] !== undefined) counts[r._id] = r.count;
    });
    res.json({ success: true, data: counts });
  } catch (error) {
    console.error("docCounts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * CREATE
 * POST /api/v1/tenders/docs
 * ============================================================ */
const createDoc = async (req, res) => {
  try {
    const {
      category,
      title,
      description,
      reference,
      validity,
      validityDate,
      issuedOn,
      subtitle,
      chips,
      fileUrl,
      docType,
    } = req.body;

    if (!category || !title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "category and title are required" });
    }

    const finalDescription =
      category === "profiles"
        ? (description || subtitle || "").trim()
        : (description || "").trim();

    const doc = await CompanyDocument.create({
      category,
      title: title.trim(),
      description: finalDescription,
      reference: reference || "",
      validity: validity || "",
      validUntil: toDate(validityDate),
      issuedOn: toDate(issuedOn),
      subtitle: subtitle || "",
      chips: Array.isArray(chips) ? chips : [],
      fileUrl: fileUrl || "",
      docType: docType || "",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const obj = doc.toObject();
    res.status(201).json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    console.error("createDoc error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPDATE
 * PATCH /api/v1/tenders/docs/:id
 * ============================================================ */
const updateDoc = async (req, res) => {
  try {
    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    const allowed = [
      "title",
      "description",
      "reference",
      "validity",
      "subtitle",
      "chips",
      "fileUrl",
      "docType",
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    }

    if (req.body.validityDate !== undefined) {
      doc.validUntil = toDate(req.body.validityDate);
    }
    if (req.body.issuedOn !== undefined) {
      doc.issuedOn = toDate(req.body.issuedOn);
    }

    doc.updatedBy = req.user._id;
    await doc.save();

    const obj = doc.toObject();
    res.json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    console.error("updateDoc error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * RENEW
 * POST /api/v1/tenders/docs/:id/renew
 * ============================================================ */
const renewDoc = async (req, res) => {
  try {
    const { validityDate, issuedOn } = req.body;

    if (!validityDate) {
      return res
        .status(400)
        .json({ success: false, message: "validityDate is required" });
    }

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    doc.validUntil = toDate(validityDate);
    if (issuedOn !== undefined) doc.issuedOn = toDate(issuedOn);
    doc.updatedBy = req.user._id;
    await doc.save();

    const obj = doc.toObject();
    res.json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    console.error("renewDoc error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * DELETE
 * DELETE /api/v1/tenders/docs/:id
 * ============================================================ */
const deleteDoc = async (req, res) => {
  try {
    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    if (doc.fileUrl) {
      try {
        const prev = path.basename(doc.fileUrl);
        const full = path.join(companyDocUploadDir, prev);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) {
        console.warn("Could not delete file from disk:", err.message);
      }
    }

    await doc.deleteOne();
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    console.error("deleteDoc error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * IMPORT SELECTED DOCS INTO A TENDER
 * POST /api/v1/tenders/docs/import
 * ============================================================ */
const importDocsToTender = async (req, res) => {
  try {
    const { targetTenderId, documentIds } = req.body;

    if (!targetTenderId || !Array.isArray(documentIds) || !documentIds.length) {
      return res.status(400).json({
        success: false,
        message: "targetTenderId and documentIds[] are required",
      });
    }

    const result = await CompanyDocument.updateMany(
      { _id: { $in: documentIds } },
      {
        $push: {
          importedInto: {
            tenderId: targetTenderId,
            importedAt: new Date(),
            importedBy: req.user._id,
          },
        },
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} document(s) imported`,
    });
  } catch (error) {
    console.error("importDocsToTender error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================
 * UPLOAD FILE
 * POST /api/v1/tenders/docs/:id/file
 * ============================================================ */
const uploadDocFile = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const prev = await CompanyDocument.findById(req.params.id)
      .select("fileUrl")
      .lean();

    if (!prev) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    if (prev.fileUrl) {
      try {
        const oldName = path.basename(prev.fileUrl);
        const full = path.join(companyDocUploadDir, oldName);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) {
        console.warn("Could not delete old file:", err.message);
      }
    }

    const newUrl = `/uploads/company-docs/${req.file.filename}`;

    const doc = await CompanyDocument.findByIdAndUpdate(
      req.params.id,
      {
        fileUrl: newUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileMime: req.file.mimetype,
        updatedBy: req.user._id,
      },
      { new: true }
    ).lean();

    console.log("[uploadDocFile] ✅ saved:", newUrl);

    res.status(201).json({ success: true, data: computeStatus(doc) });
  } catch (error) {
    console.error("uploadDocFile error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listDocs,
  docCounts,
  listAndCounts,
  createDoc,
  updateDoc,
  renewDoc,
  deleteDoc,
  importDocsToTender,
  uploadDocFile,
};