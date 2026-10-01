// src/services/onlineCrm/onlineCrm.service.js
const OnlineQuery = require('../../models/onlineCrm/OnlineQuery.model');
const RFQ = require('../../models/rfq/RFQ');
const Quotation = require('../../models/Quotation.model');
const Tender = require('../../models/Tender.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
  STAGES,
  SOURCES,
  STATUSES,
} = require('../../models/onlineCrm/OnlineQuery.model');

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ============================================================
// SHAPE FOR FRONTEND (OnlineQuery only)
// ============================================================
function toClientShape(doc) {
  const d = doc.toObject ? doc.toObject() : doc;

  const daysAging = d.date
    ? Math.max(
      0,
      Math.floor((Date.now() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24))
    )
    : 0;

  return {
    id: d._id.toString(),
    rfqNumber: d.rfqNumber,
    date: d.date,
    company: d.company,
    country: d.country,
    product: d.product,
    productCategory: d.productCategory,
    assigned: d.assigned,
    source: d.source,
    value: d.value,
    stage: d.stage,
    status: d.status,
    comments: d.comments,
    daysAging,
    rfqId: d.rfqId?.toString() || null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    lastUpdated: d.updatedAt || d.createdAt,
  };
}

// ============================================================
// BUILD MONGO FILTER
// ============================================================
function buildFilter(q = {}) {
  const filter = {};

  if (q.stage && q.stage !== 'all') filter.stage = q.stage;
  if (q.source && q.source !== 'all') filter.source = q.source;
  if (q.country && q.country !== 'all') filter.country = q.country;
  if (q.assigned && q.assigned !== 'all') filter.assigned = q.assigned;
  if (q.status && q.status !== 'all') filter.status = q.status;

  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [
      { company: re },
      { rfqNumber: re },
      { product: re },
    ];
  }

  if (q.dateFrom || q.dateTo) {
    filter.date = {};
    if (q.dateFrom) filter.date.$gte = new Date(q.dateFrom);
    if (q.dateTo) filter.date.$lte = new Date(q.dateTo);
  }

  if (q.month !== undefined && q.month !== null && q.month !== '') {
    const monthNum = Number(q.month);
    if (!Number.isNaN(monthNum) && monthNum >= 0 && monthNum <= 11) {
      const year = q.year ? Number(q.year) : new Date().getFullYear();
      const start = new Date(year, monthNum, 1);
      const end = new Date(year, monthNum + 1, 0, 23, 59, 59);
      filter.date = { $gte: start, $lte: end };
    }
  }

  return filter;
}

// ============================================================
// RFQ NUMBER GENERATOR
// ============================================================
async function generateRfqNumber() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);

  const prefix = `NGS-${mm}${dd}${yy}`;

  const last = await OnlineQuery.findOne({
    rfqNumber: { $regex: `^${prefix}` },
  })
    .sort({ rfqNumber: -1 })
    .lean();

  let seq = 1;
  if (last?.rfqNumber) {
    const parts = last.rfqNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}-${seq}`;
}

// ============================================================
// UNIFIED HELPERS
// ============================================================

/** Extract owner name from a field that might be string / object / ObjectId */
function extractOwner(v) {
  if (!v) return 'Unassigned';
  if (typeof v === 'string') return v.trim() || 'Unassigned';
  if (typeof v === 'object') {
    return (
      v.fullName ||
      v.name ||
      v.email ||
      'Unassigned'
    );
  }
  return 'Unassigned';
}

/** Days aging from a date */
function daysAgingFrom(date) {
  if (!date) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  );
}

/** Derive unified stage from an RFQ */
function rfqStage(rfq) {
  const s = String(rfq.stage || '').toLowerCase();
  if (s === 'pending') return 'To Start';
  if (s === 'quoted') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  if (s === 'archived') return 'Quoted';   // show archived as Quoted
  return 'To Start';
}

/** Derive unified stage from a Tender */
function tenderStage(tender) {
  const s = String(tender.stage || '').toLowerCase();
  if (s === 'won' || s === 'submitted') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  return 'To Start';
}

/** Derive unified stage from a Quotation */
function quotationStage(q) {
  const s = String(q.status || '').toLowerCase();
  if (s === 'draft' || s === 'awaiting_approval') return 'Not Quoted';
  if (s === 'sent' || s === 'won') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  return 'Not Quoted';
}

/** Derive unified stage from an OnlineQuery (direct) */
function onlineQueryStage(q) {
  const s = String(q.stage || '').toLowerCase();
  if (s === 'to start') return 'To Start';
  if (s === 'not quoted') return 'Not Quoted';
  if (s === 'quoted') return 'Quoted';
  return 'To Start';
}

/** Map source label for RFQ → unified `origin` */
function rfqOrigin(rfq) {
  const src = String(rfq.source || '').toLowerCase();
  if (src === 'online') return 'Portal';
  return 'Manual';
}

/** Map source label for Tender → unified `origin` */
function tenderOrigin(tender) {
  const t = String(tender.tenderType || '').toLowerCase();
  if (t.includes('egp')) return 'Portal';
  if (t.includes('rfq')) return 'Email';
  return 'Site Visit';
}

/** Map source label for Quotation → unified `origin` */
function quotationOrigin(q) {
  const src = String(q.source || '').toLowerCase();
  if (src === 'quotation-builder') return 'Portal';
  if (src === 'online') return 'Portal';
  return 'Email';
}

// ============================================================
// NORMALIZE each source → unified row
// ============================================================
function normalizeRfq(rfq) {
  const firstProduct = rfq.products?.[0];
  return {
    id: `rfq-${rfq._id}`,
    source: 'rfq',
    sourceLabel: 'RFQ',
    rfqNumber: rfq.rfqNumber || '',
    date: rfq.createdAt || rfq.date || new Date(),
    company: rfq.company || '',
    country: rfq.country || '',
    product: firstProduct?.name || rfq.projectName || '',
    productCategory: '',
    assigned: extractOwner(rfq.assignedTo || rfq.salesman),
    origin: rfqOrigin(rfq),
    daysAging: daysAgingFrom(rfq.createdAt || rfq.date),
    stage: rfqStage(rfq),
    status: rfq.stage,
    value: null,           // RFQs don't carry monetary value
    currency: 'BDT',
    raw: rfq._id.toString(),
    createdAt: rfq.createdAt || rfq.date,
  };
}

function normalizeTender(tender) {
  return {
    id: `tender-${tender._id}`,
    source: 'tender',
    sourceLabel: 'Tender',
    rfqNumber: tender.tenderer || '',    // show tenderer as the ref
    date: tender.createdAt || new Date(),
    company: tender.tenderer || '',
    country: tender.country || '',
    product: tender.title || '',
    productCategory: '',
    assigned: extractOwner(tender.owner || tender.responsiblePerson || tender.recordedBy),
    origin: tenderOrigin(tender),
    daysAging: daysAgingFrom(tender.createdAt),
    stage: tenderStage(tender),
    status: tender.stage,
    value: Number(tender.bidValue || tender.tentativeBudget || 0) || null,
    currency: tender.currency || 'BDT',
    raw: tender._id.toString(),
    createdAt: tender.createdAt,
  };
}

function normalizeQuotation(q) {
  return {
    id: `quote-${q._id}`,
    source: 'quotation',
    sourceLabel: 'Quote',
    rfqNumber: q.pqNumber || '',
    date: q.createdAt || new Date(),
    company: q.client?.company || '',
    country: q.client?.country || q.territory || '',
    product: q.lines?.[0]?.name || '',
    productCategory: '',
    assigned: extractOwner(q.crmManager || q.createdBy),
    origin: quotationOrigin(q),
    daysAging: daysAgingFrom(q.createdAt),
    stage: quotationStage(q),
    status: q.status,
    value: Number(q.totals?.grandTotal || 0) || null,
    currency: q.currency || 'BDT',
    raw: q._id.toString(),
    createdAt: q.createdAt,
  };
}

function normalizeOnlineQuery(q) {
  return {
    id: `online-${q._id}`,
    source: 'online',
    sourceLabel: 'Online',
    rfqNumber: q.rfqNumber || '',
    date: q.date || q.createdAt || new Date(),
    company: q.company || '',
    country: q.country || '',
    product: q.product || '',
    productCategory: q.productCategory || '',
    assigned: q.assigned || 'Unassigned',
    origin: q.source || 'Email',
    daysAging: daysAgingFrom(q.date || q.createdAt),
    stage: onlineQueryStage(q),
    status: q.status,
    value: q.value || null,
    currency: 'BDT',
    raw: q._id.toString(),
    createdAt: q.createdAt,
  };
}

// ============================================================
// UNIFIED MERGE
// ============================================================
async function fetchUnifiedRows(q = {}) {
  // Build simple filters for each source (independent per-source)
  const countryFilter = q.country && q.country !== 'all' ? q.country : null;
  const searchFilter = q.search ? String(q.search).trim() : null;

  const searchRe = searchFilter ? new RegExp(searchFilter, 'i') : null;

  // ============================================================
  // Parallel fetch — 4 sources
  // ============================================================
  const [rfqs, tenders, quotations, onlineQueries] = await Promise.all([
    // ---- RFQ ----
    RFQ.find({
      stage: { $nin: ['archived'] },
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ company: searchRe }, { rfqNumber: searchRe }] }
        : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    // ---- Tender ----
    Tender.find({
      draft: { $ne: true },
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ tenderer: searchRe }, { title: searchRe }] }
        : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    // ---- Quotation ----
    Quotation.find({
      ...(searchRe
        ? { $or: [{ pqNumber: searchRe }, { 'client.company': searchRe }] }
        : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    // ---- OnlineQuery ----
    OnlineQuery.find({
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ company: searchRe }, { rfqNumber: searchRe }] }
        : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),
  ]);

  // ============================================================
  // Normalize each → unified row
  // ============================================================
  const allRows = [
    ...rfqs.map(normalizeRfq),
    ...tenders.map(normalizeTender),
    ...quotations.map(normalizeQuotation),
    ...onlineQueries.map(normalizeOnlineQuery),
  ];

  // ============================================================
  // Filter by stage (if requested)
  // ============================================================
  let filtered = allRows;
  if (q.stage && q.stage !== 'all') {
    filtered = filtered.filter((r) => r.stage === q.stage);
  }

  // ============================================================
  // Filter by source (if requested)
  // ============================================================
  if (q.originSource && q.originSource !== 'all') {
    filtered = filtered.filter((r) => r.source === q.originSource);
  }

  // ============================================================
  // Sort newest first
  // ============================================================
  filtered.sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  return filtered;
}

// ============================================================
// SERVICE
// ============================================================
const OnlineCrmService = {
  // ---------- LIST (unchanged, OnlineQuery only) ----------
  async listQueries(q = {}) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Number(q.limit) || 100, 500);
    const skip = (page - 1) * limit;

    const filter = buildFilter(q);
    const sort = { date: -1 };

    const [items, total] = await Promise.all([
      OnlineQuery.find(filter).sort(sort).skip(skip).limit(limit),
      OnlineQuery.countDocuments(filter),
    ]);

    return {
      items: items.map(toClientShape),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // ---------- GET BY ID ----------
  async getById(id) {
    const doc = await OnlineQuery.findById(id);
    if (!doc) throw ApiError.notFound('Online query not found');
    return toClientShape(doc);
  },

  // ---------- CREATE ----------
  async createQuery(dto, userId) {
    if (!dto.company || !String(dto.company).trim()) {
      throw ApiError.badRequest('Company is required');
    }
    if (!dto.country || !String(dto.country).trim()) {
      throw ApiError.badRequest('Country is required');
    }

    const rfqNumber = dto.rfqNumber || (await generateRfqNumber());

    const doc = new OnlineQuery({
      rfqNumber,
      date: dto.date ? new Date(dto.date) : new Date(),
      company: String(dto.company).trim(),
      country: String(dto.country).trim(),
      product: dto.product || '',
      productCategory: dto.productCategory || '',
      assigned: dto.assigned || 'Unassigned',
      source: dto.source || 'Email',
      value:
        dto.value === undefined || dto.value === null || dto.value === ''
          ? null
          : Number(dto.value),
      stage: dto.stage || 'To Start',
      status: dto.status || 'Pending',
      comments: dto.comments || '',
      rfqId: dto.rfqId || null,
      createdBy: userId || null,
    });

    await doc.save();

    // ⭐ Auto-capture to Client 360
    try {
      const { Client360Service } = require('../client360/client360.service');
      await Client360Service.autoCaptureFromOnlineQuery(doc, userId);
    } catch (e) {
      console.error('[onlineCrm.service] Client 360 auto-capture failed:', e.message);
    }

    return toClientShape(doc);
  },

  // ---------- UPDATE ----------
  async updateQuery(id, dto, userId) {
    const doc = await OnlineQuery.findById(id);
    if (!doc) throw ApiError.notFound('Online query not found');

    const patchable = [
      'company', 'country', 'product', 'productCategory',
      'assigned', 'source', 'value', 'stage', 'status', 'comments',
    ];

    for (const key of patchable) {
      if (dto[key] !== undefined) doc[key] = dto[key];
    }

    if (dto.date) doc.date = new Date(dto.date);

    doc.updatedBy = userId || null;
    await doc.save();
    return toClientShape(doc);
  },

  // ---------- DELETE ----------
  async removeQuery(id) {
    const doc = await OnlineQuery.findByIdAndDelete(id);
    if (!doc) throw ApiError.notFound('Online query not found');
    return { id };
  },

  async bulkRemove(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw ApiError.badRequest('No ids provided');
    }
    const result = await OnlineQuery.deleteMany({ _id: { $in: ids } });
    return { deletedCount: result.deletedCount || 0 };
  },

  // ---------- KPI STATS (unchanged, OnlineQuery only) ----------
  async stats(q = {}) {
    const filter = buildFilter({ ...q, stage: undefined, month: undefined });

    const all = await OnlineQuery.find(filter).lean();

    let active = 0;
    let quotedBDT = 0;
    let quotedUSD = 0;
    let quotedCount = 0;
    let notQuoted = 0;
    let overdue = 0;

    const now = Date.now();
    const overdueThreshold = 15 * 24 * 60 * 60 * 1000;

    for (const r of all) {
      active += 1;

      if (r.stage === 'Quoted') {
        quotedCount += 1;
        if (typeof r.value === 'number') {
          quotedBDT += r.value;
        }
      }
      if (r.stage === 'Not Quoted') {
        notQuoted += 1;
      }

      const ageMs = r.date ? now - new Date(r.date).getTime() : 0;
      if (ageMs > overdueThreshold && r.stage !== 'Quoted') {
        overdue += 1;
      }
    }

    const assigneeMap = {};
    all.forEach((r) => {
      assigneeMap[r.assigned] = (assigneeMap[r.assigned] || 0) + 1;
    });
    const crmManager =
      Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      'Unassigned';

    return {
      activeCount: active,
      quotedValueBDT: quotedBDT,
      quotedValueUSD: quotedUSD,
      quotedCount,
      notQuoted,
      overdue,
      crmManager,
      total: all.length,
    };
  },

  // ---------- MONTHLY VOLUME (unchanged) ----------
  async monthlyVolume(q = {}) {
    const filter = buildFilter({ ...q, month: undefined });
    const rows = await OnlineQuery.find(filter).lean();

    const year = q.year ? Number(q.year) : new Date().getFullYear();

    const monthly = new Array(12).fill(0);
    for (const r of rows) {
      if (!r.date) continue;
      const d = new Date(r.date);
      if (d.getFullYear() !== year) continue;
      monthly[d.getMonth()] += 1;
    }

    return { year, months: MONTHS, data: monthly };
  },

  // ---------- BY COUNTRY (unchanged) ----------
  async byCountry(q = {}) {
    const filter = buildFilter({ ...q, month: undefined });
    const rows = await OnlineQuery.find(filter).lean();

    const map = {};
    let total = 0;
    for (const r of rows) {
      const key = r.country || 'Unknown';
      map[key] = (map[key] || 0) + 1;
      total += 1;
    }

    const entries = Object.entries(map)
      .map(([country, count]) => ({
        country,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { total, entries };
  },

  // ---------- TOP PRODUCTS (unchanged) ----------
  async topProducts(q = {}) {
    const filter = buildFilter({ ...q, month: undefined });
    const rows = await OnlineQuery.find(filter).lean();

    const productMap = {};
    const clientMap = {};
    for (const r of rows) {
      const p = r.product || 'Unspecified';
      productMap[p] = (productMap[p] || 0) + 1;

      const c = r.company || 'Unknown';
      clientMap[c] = (clientMap[c] || 0) + 1;
    }

    const products = Object.entries(productMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const clients = Object.entries(clientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { products, clients };
  },

  // ---------- DISTINCT COUNTRIES ----------
  async countries() {
    const list = await OnlineQuery.distinct('country');
    return list.filter(Boolean).sort();
  },

  // ============================================================
  // ⭐ UNIFIED — Merge RFQ + Tender + Quotation + OnlineQuery
  // ============================================================

  // ---------- LIST UNIFIED ----------
  async unifiedList(q = {}) {
    const rows = await fetchUnifiedRows(q);

    // Pagination
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Number(q.limit) || 200, 500);
    const skip = (page - 1) * limit;
    const paged = rows.slice(skip, skip + limit);

    return {
      items: paged,
      total: rows.length,
      page,
      limit,
      totalPages: Math.ceil(rows.length / limit),
    };
  },

  // ---------- UNIFIED KPIs ----------
  async unifiedStats(q = {}) {
    const rows = await fetchUnifiedRows(q);

    let active = 0;
    let quotedBDT = 0;
    let quotedUSD = 0;
    let quotedCount = 0;
    let notQuoted = 0;
    let overdue = 0;

    const overdueThreshold = 15;   // days

    for (const r of rows) {
      active += 1;

      if (r.stage === 'Quoted') {
        quotedCount += 1;
        if (typeof r.value === 'number') {
          if (String(r.currency).toUpperCase().includes('USD')) {
            quotedUSD += r.value;
          } else {
            quotedBDT += r.value;
          }
        }
      }
      if (r.stage === 'Not Quoted') notQuoted += 1;
      if (r.daysAging > overdueThreshold && r.stage !== 'Quoted') overdue += 1;
    }

    // CRM Manager = most-frequent assigned
    const assigneeMap = {};
    rows.forEach((r) => {
      if (!r.assigned || r.assigned === 'Unassigned') return;
      assigneeMap[r.assigned] = (assigneeMap[r.assigned] || 0) + 1;
    });
    const crmManager =
      Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      'Unassigned';

    return {
      activeCount: active,
      quotedValueBDT: quotedBDT,
      quotedValueUSD: quotedUSD,
      quotedCount,
      notQuoted,
      overdue,
      crmManager,
      total: rows.length,
    };
  },

  // ---------- UNIFIED MONTHLY VOLUME ----------
  async unifiedMonthlyVolume(q = {}) {
    const rows = await fetchUnifiedRows({ ...q, month: undefined });
    const year = q.year ? Number(q.year) : new Date().getFullYear();

    const monthly = new Array(12).fill(0);
    for (const r of rows) {
      if (!r.date) continue;
      const d = new Date(r.date);
      if (d.getFullYear() !== year) continue;
      monthly[d.getMonth()] += 1;
    }

    return { year, months: MONTHS, data: monthly };
  },

  // ---------- UNIFIED BY COUNTRY ----------
  async unifiedByCountry(q = {}) {
    const rows = await fetchUnifiedRows({ ...q, month: undefined });

    const map = {};
    let total = 0;
    for (const r of rows) {
      const key = r.country || 'Unknown';
      map[key] = (map[key] || 0) + 1;
      total += 1;
    }

    const entries = Object.entries(map)
      .map(([country, count]) => ({
        country,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { total, entries };
  },

  // ---------- UNIFIED TOP PRODUCTS + CLIENTS ----------
  async unifiedTopProducts(q = {}) {
    const rows = await fetchUnifiedRows({ ...q, month: undefined });

    const productMap = {};
    const clientMap = {};
    for (const r of rows) {
      const p = r.product || 'Unspecified';
      productMap[p] = (productMap[p] || 0) + 1;

      const c = r.company || 'Unknown';
      clientMap[c] = (clientMap[c] || 0) + 1;
    }

    const products = Object.entries(productMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const clients = Object.entries(clientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { products, clients };
  },
};

module.exports = { OnlineCrmService, toClientShape };