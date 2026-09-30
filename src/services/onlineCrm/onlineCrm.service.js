// src/services/onlineCrm/onlineCrm.service.js
const OnlineQuery = require('../../models/onlineCrm/OnlineQuery.model');
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
// SHAPE FOR FRONTEND
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
// NGS-{MM}{DD}{YY}-{seq}
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
// SERVICE
// ============================================================
const OnlineCrmService = {
  // ---------- LIST ----------
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

  // ---------- KPI STATS ----------
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

    // Find the most-common assignee as CRM Manager
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

  // ---------- MONTHLY VOLUME (12 numbers) ----------
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

  // ---------- BY COUNTRY ----------
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

  // ---------- TOP PRODUCTS / CLIENTS ----------
  async topProducts(q = {}) {
    const filter = buildFilter({ ...q, month: undefined });
    const rows = await OnlineQuery.find(filter).lean();

    // Top products
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
};

module.exports = { OnlineCrmService, toClientShape };