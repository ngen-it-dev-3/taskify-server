// src/controllers/tender/companyDoc.controller.js
const path = require("path");
const fs = require("fs");
const CompanyDocument = require("../../models/CompanyDocument.model");
const { companyDocUploadDir } = require("../../middleware/upload.middleware");

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function computeStatus(doc) {
  if (!doc.validUntil) {
    return { ...doc, status: doc.status || "Valid", action: doc.action === "Renew" ? "View" : doc.action || "View" };
  }
  const now = Date.now();
  const diffDays = Math.ceil((new Date(doc.validUntil).getTime() - now) / 86400000);
  if (diffDays < 0) return { ...doc, status: "Expired", action: "Renew" };
  if (diffDays <= 30) return { ...doc, status: "Expiring Soon", action: "Renew" };
  return { ...doc, status: "Valid", action: doc.action === "Renew" ? "View" : doc.action || "View" };
}

const parseDurationFilter = (filter) => {
  if (!filter || filter === "all") return 0;
  const m = String(filter).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
};

const parseVolumeFilter = (filter) => {
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
};

const parseEntryYears = (raw) => {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
};

const parseEntryVolume = (raw) => {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  return parseVolumeFilter(String(raw));
};

const extractDocYears = (doc) => {
  if (!doc) return 0;
  if (doc.experienceYears !== undefined && doc.experienceYears !== null) return parseEntryYears(doc.experienceYears);
  if (doc.duration !== undefined && doc.duration !== null) return parseEntryYears(doc.duration);
  const chips = Array.isArray(doc.chips) ? doc.chips : [];
  const durationChip = chips.find((c) => /Yr|year/i.test(String(c)));
  return durationChip ? parseEntryYears(durationChip) : 0;
};

const extractDocVolume = (doc) => {
  if (!doc) return 0;
  if (doc.totalValue !== undefined && doc.totalValue !== null) return parseEntryVolume(doc.totalValue);
  if (doc.volume !== undefined && doc.volume !== null) return parseEntryVolume(doc.volume);
  const chips = Array.isArray(doc.chips) ? doc.chips : [];
  const volumeChip = chips.find((c) => /[৳$]|L\+|Cr/i.test(String(c)));
  return volumeChip ? parseEntryVolume(volumeChip) : 0;
};

const buildQuery = ({ category, sector }) => {
  const query = {};
  if (category && category !== "all") query.category = category;
  if (sector && sector !== "all") query.chips = sector;
  return query;
};

// ✅ Removed -createdBy so we can populate it
const LIST_PROJECTION = "-importedInto -updatedBy -__v";

const listDocs = async (req, res) => {
  try {
    const { category, sector, duration, volume, status } = req.query;
    const query = buildQuery({ category, sector });

    // ✅ Added populate for createdBy
    let rows = await CompanyDocument.find(query, LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .populate("createdBy", "fullName name email")
      .lean();

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
      const map = { expired: "Expired", expiring: "Expiring Soon", valid: "Valid" };
      const target = map[status];
      if (target) enriched = enriched.filter((d) => d.status === target);
    }

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listAndCounts = async (req, res) => {
  try {
    const { category, sector, duration, volume, status } = req.query;
    const query = buildQuery({ category, sector });

    const [rawRows, countsAgg] = await Promise.all([
      // ✅ Added populate for createdBy here too
      CompanyDocument.find(query, LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .populate("createdBy", "fullName name email")
        .lean(),
      CompanyDocument.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    ]);

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
      const map = { expired: "Expired", expiring: "Expiring Soon", valid: "Valid" };
      const target = map[status];
      if (target) enriched = enriched.filter((d) => d.status === target);
    }

    // ✅ Updated counts
    const counts = { legal: 0, profiles: 0, "work-orders": 0, certificates: 0, team: 0, datasheets: 0 };
    countsAgg.forEach((c) => {
      if (counts[c._id] !== undefined) counts[c._id] = c.count;
    });

    res.json({ success: true, data: { list: enriched, counts } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const docCounts = async (_req, res) => {
  try {
    const rows = await CompanyDocument.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
    const counts = { legal: 0, profiles: 0, "work-orders": 0, certificates: 0, team: 0, datasheets: 0 };
    rows.forEach((r) => {
      if (counts[r._id] !== undefined) counts[r._id] = r.count;
    });
    res.json({ success: true, data: counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createDoc = async (req, res) => {
  try {
    const {
      category, title, description, reference, validity, validityDate, issuedOn,
      subtitle, chips, fileUrl, docType,
      // Work Order
      totalValue, customerType, isGovt, products, workType, certReceived,
      // Team
      experienceYears, isEngineer
    } = req.body;

    if (!category || !title?.trim()) {
      return res.status(400).json({ success: false, message: "category and title are required" });
    }

    const finalDescription = category === "profiles" ? (description || subtitle || "").trim() : (description || "").trim();

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
      // Work order
      totalValue: Number(totalValue) || 0,
      customerType: customerType || "",
      isGovt: !!isGovt,
      products: Array.isArray(products) ? products : [],
      workType: workType || "",
      certReceived: !!certReceived,
      // Team
      experienceYears: Number(experienceYears) || 0,
      isEngineer: !!isEngineer,

      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const obj = doc.toObject();
    res.status(201).json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDoc = async (req, res) => {
  try {
    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const allowed = [
      "title", "description", "reference", "validity", "subtitle", "chips", "fileUrl", "docType",
      "totalValue", "customerType", "isGovt", "products", "workType", "certReceived",
      "experienceYears", "isEngineer"
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    }

    if (req.body.validityDate !== undefined) doc.validUntil = toDate(req.body.validityDate);
    if (req.body.issuedOn !== undefined) doc.issuedOn = toDate(req.body.issuedOn);

    doc.updatedBy = req.user._id;
    await doc.save();

    const obj = doc.toObject();
    res.json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const renewDoc = async (req, res) => {
  try {
    const { validityDate, issuedOn } = req.body;
    if (!validityDate) return res.status(400).json({ success: false, message: "validityDate is required" });

    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    doc.validUntil = toDate(validityDate);
    if (issuedOn !== undefined) doc.issuedOn = toDate(issuedOn);
    doc.updatedBy = req.user._id;
    await doc.save();

    const obj = doc.toObject();
    res.json({ success: true, data: computeStatus(obj) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDoc = async (req, res) => {
  try {
    const doc = await CompanyDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    if (doc.fileUrl) {
      try {
        const prev = path.basename(doc.fileUrl);
        const full = path.join(companyDocUploadDir, prev);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) { console.warn("Could not delete file:", err.message); }
    }

    await doc.deleteOne();
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const importDocsToTender = async (req, res) => {
  try {
    const { targetTenderId, documentIds } = req.body;
    if (!targetTenderId || !Array.isArray(documentIds) || !documentIds.length) {
      return res.status(400).json({ success: false, message: "targetTenderId and documentIds[] are required" });
    }

    const result = await CompanyDocument.updateMany(
      { _id: { $in: documentIds } },
      { $push: { importedInto: { tenderId: targetTenderId, importedAt: new Date(), importedBy: req.user._id } } }
    );

    res.json({ success: true, message: `${result.modifiedCount} document(s) imported` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadDocFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const prev = await CompanyDocument.findById(req.params.id).select("fileUrl").lean();
    if (!prev) {
      try { fs.unlinkSync(req.file.path); } catch { }
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    if (prev.fileUrl) {
      try {
        const oldName = path.basename(prev.fileUrl);
        const full = path.join(companyDocUploadDir, oldName);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (err) { console.warn("Could not delete old file:", err.message); }
    }

    const newUrl = `/uploads/company-docs/${req.file.filename}`;

    const doc = await CompanyDocument.findByIdAndUpdate(
      req.params.id,
      { fileUrl: newUrl, fileName: req.file.originalname, fileSize: req.file.size, fileMime: req.file.mimetype, updatedBy: req.user._id },
      { new: true }
    ).lean();

    res.status(201).json({ success: true, data: computeStatus(doc) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listDocs, docCounts, listAndCounts, createDoc, updateDoc, renewDoc, deleteDoc, importDocsToTender, uploadDocFile,
};