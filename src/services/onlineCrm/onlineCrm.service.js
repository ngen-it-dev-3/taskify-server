// src/services/onlineCrm/onlineCrm.service.js
const OnlineQuery = require('../../models/onlineCrm/OnlineQuery.model');
const RFQ = require('../../models/rfq/RFQ');
const Quotation = require('../../models/Quotation.model');
const Tender = require('../../models/Tender.model');
const { User } = require('../../models/User.model');   // ⭐ ADDED
const { Department } = require('../../models/Department.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
  STAGES,
  SOURCES,
  STATUSES,
  CURRENCIES,
} = require('../../models/onlineCrm/OnlineQuery.model');

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ============================================================
// WHITELIST — every field the client can create or update
// ============================================================
const UPDATABLE_FIELDS = [
  'company', 'country', 'product', 'productCategory', 'description',
  'referenceLink', 'recordedBy',
  'assigned', 'responsiblePerson',
  'source',
  'value', 'bidValue', 'currency',
  'stage', 'status', 'draft',
  'lastDateOfPurchase', 'lastDateOfSubmission', 'submittedAt',
  'mode', 'participate', 'docStatus',
  'securityAmount', 'securityValidity', 'performanceSecurityValidity',
  'contactName', 'contactPhone', 'contactEmail', 'contactAddress',
  'comments', 'note', 'eligibility',
  'rfqId',
  'date',
];

function pickUpdatable(payload = {}) {
  const out = {};
  for (const key of UPDATABLE_FIELDS) {
    if (payload[key] !== undefined) out[key] = payload[key];
  }
  return out;
}

function toDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
// ============================================================
// ⭐ FETCH CRM-DIVISION USERS
// ============================================================
async function fetchCrmUsers() {
  try {
    // Step 1 — Find the CRM department by name
    // (Try exact match first, then fuzzy)
    let crmDept = await Department.findOne({
      name: { $regex: /^crm$/i },
    })
      .select('_id name')
      .lean();

    if (!crmDept) {
      // Fuzzy fallback — match any department containing "crm"
      crmDept = await Department.findOne({
        name: { $regex: /crm/i },
      })
        .select('_id name')
        .lean();
    }

    if (!crmDept) {
      // Log available departments to help debug
      const allDepts = await Department.find({}, { name: 1 })
        .limit(30)
        .lean();
      console.log(
        '[fetchCrmUsers] No CRM department found. Available:',
        allDepts.map((d) => d.name)
      );
      return [];
    }

    console.log(
      '[fetchCrmUsers] Found CRM dept:',
      crmDept.name,
      '(_id:', crmDept._id + ')'
    );

    // Step 2 — Find all active users in that department.
    // The user schema has BOTH `department` and `departmentId` as
    // ObjectIds referencing Department — so we check both.
    const users = await User.find({
      isActive: { $ne: false },
      $or: [
        { department: crmDept._id },
        { departmentId: crmDept._id },
      ],
    })
      .select('fullName name email role')
      .limit(20)
      .lean();

    console.log('[fetchCrmUsers] matched', users.length, 'CRM users');

    return users.map((u) => ({
      name: u.fullName || u.name || u.email || 'Unknown',
      email: u.email || '',
      role: u.role || 'employee',
    }));
  } catch (e) {
    console.warn('[fetchCrmUsers] failed:', e.message);
    return [];
  }
}
// ============================================================
// SHAPE FOR FRONTEND
// ============================================================
function toClientShape(doc) {
  const d = doc.toObject ? doc.toObject() : doc;

  const daysAging = d.date
    ? Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24)
      )
    )
    : 0;

  return {
    id: d._id.toString(),
    rfqNumber: d.rfqNumber,
    date: d.date,
    draft: !!d.draft,

    company: d.company,
    country: d.country,
    product: d.product,
    productCategory: d.productCategory,
    description: d.description || '',

    referenceLink: d.referenceLink || '',
    recordedBy: d.recordedBy || '',

    assigned: d.assigned,
    responsiblePerson: d.responsiblePerson || '',

    source: d.source,

    value: d.value,
    bidValue: d.bidValue ?? 0,
    currency: d.currency || 'BDT',

    stage: d.stage,
    status: d.status,

    lastDateOfPurchase: d.lastDateOfPurchase || null,
    lastDateOfSubmission: d.lastDateOfSubmission || null,
    submittedAt: d.submittedAt || null,

    mode: d.mode || '',
    participate: d.participate || '',
    docStatus: d.docStatus || '',

    securityAmount: d.securityAmount ?? 0,
    securityValidity: d.securityValidity || null,
    performanceSecurityValidity: d.performanceSecurityValidity || null,

    contactName: d.contactName || '',
    contactPhone: d.contactPhone || '',
    contactEmail: d.contactEmail || '',
    contactAddress: d.contactAddress || '',

    comments: d.comments || '',
    note: d.note || '',
    eligibility: d.eligibility || '',

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

  if (q.includeDrafts !== 'true' && q.draft !== 'true') {
    filter.draft = { $ne: true };
  }

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

  if (
    q.month !== undefined &&
    q.month !== null &&
    q.month !== '' &&
    q.month !== 'all'
  ) {
    const monthNum = Number(q.month);
    if (!Number.isNaN(monthNum) && monthNum >= 0 && monthNum <= 11) {
      const year = q.year ? Number(q.year) : new Date().getFullYear();
      const start = new Date(year, monthNum, 1);
      const end = new Date(year, monthNum + 1, 0, 23, 59, 59);
      filter.date = { $gte: start, $lte: end };
    } else {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      const idx = monthNames.indexOf(String(q.month).trim());
      if (idx >= 0) {
        const year =
          q.year && q.year !== 'all'
            ? Number(q.year)
            : new Date().getFullYear();
        const start = new Date(year, idx, 1);
        const end = new Date(year, idx + 1, 0, 23, 59, 59);
        filter.date = { $gte: start, $lte: end };
      }
    }
  } else if (q.year && q.year !== 'all') {
    const y = Number(q.year);
    filter.date = {
      $gte: new Date(y, 0, 1),
      $lte: new Date(y, 11, 31, 23, 59, 59),
    };
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
function extractOwner(v) {
  if (!v) return 'Unassigned';
  if (typeof v === 'string') return v.trim() || 'Unassigned';
  if (typeof v === 'object') {
    return v.fullName || v.name || v.email || 'Unassigned';
  }
  return 'Unassigned';
}

function daysAgingFrom(date) {
  if (!date) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  );
}

function rfqStage(rfq) {
  const s = String(rfq.stage || '').toLowerCase();
  if (s === 'pending') return 'To Start';
  if (s === 'quoted') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  if (s === 'archived') return 'Quoted';
  return 'To Start';
}

function tenderStage(tender) {
  const s = String(tender.stage || '').toLowerCase();
  if (s === 'won' || s === 'submitted') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  return 'To Start';
}

function quotationStage(q) {
  const s = String(q.status || '').toLowerCase();
  if (s === 'draft' || s === 'awaiting_approval') return 'Not Quoted';
  if (s === 'sent' || s === 'won') return 'Quoted';
  if (s === 'lost') return 'Not Quoted';
  return 'Not Quoted';
}

function onlineQueryStage(q) {
  const s = String(q.stage || '').toLowerCase();
  if (s === 'to start') return 'To Start';
  if (s === 'not quoted') return 'Not Quoted';
  if (s === 'quoted') return 'Quoted';
  return 'To Start';
}

function rfqOrigin(rfq) {
  const src = String(rfq.source || '').toLowerCase();
  if (src === 'online') return 'Portal';
  return 'Manual';
}

function tenderOrigin(tender) {
  const t = String(tender.tenderType || '').toLowerCase();
  if (t.includes('egp')) return 'Portal';
  if (t.includes('rfq')) return 'Email';
  return 'Site Visit';
}

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
    value: null,
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
    rfqNumber: tender.tenderer || '',
    date: tender.createdAt || new Date(),
    company: tender.tenderer || '',
    country: tender.country || '',
    product: tender.title || '',
    productCategory: '',
    assigned: extractOwner(
      tender.owner || tender.responsiblePerson || tender.recordedBy
    ),
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
    currency: q.currency || 'BDT',
    raw: q._id.toString(),
    createdAt: q.createdAt,
  };
}

// ============================================================
// UNIFIED MERGE
// ============================================================
async function fetchUnifiedRows(q = {}) {
  const countryFilter = q.country && q.country !== 'all' ? q.country : null;
  const searchFilter = q.search ? String(q.search).trim() : null;
  const searchRe = searchFilter ? new RegExp(searchFilter, 'i') : null;

  const includeDrafts = q.includeDrafts === 'true' || q.draft === 'true';

  const dateFilter = {};
  if (q.dateFrom) dateFilter.$gte = new Date(q.dateFrom);
  if (q.dateTo) dateFilter.$lte = new Date(q.dateTo);

  if (!q.dateFrom && !q.dateTo && q.month && q.month !== 'all') {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    let idx = -1;
    const asNum = Number(q.month);
    if (!Number.isNaN(asNum) && asNum >= 0 && asNum <= 11) {
      idx = asNum;
    } else {
      idx = monthNames.indexOf(String(q.month).trim());
    }
    if (idx >= 0) {
      const year =
        q.year && q.year !== 'all'
          ? Number(q.year)
          : new Date().getFullYear();
      dateFilter.$gte = new Date(year, idx, 1);
      dateFilter.$lte = new Date(year, idx + 1, 0, 23, 59, 59);
    }
  } else if (!q.dateFrom && !q.dateTo && q.year && q.year !== 'all') {
    const y = Number(q.year);
    dateFilter.$gte = new Date(y, 0, 1);
    dateFilter.$lte = new Date(y, 11, 31, 23, 59, 59);
  }

  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const [rfqs, tenders, quotations, onlineQueries] = await Promise.all([
    RFQ.find({
      stage: { $nin: ['archived'] },
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ company: searchRe }, { rfqNumber: searchRe }] }
        : {}),
      ...(hasDateFilter ? { createdAt: dateFilter } : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    Tender.find({
      draft: { $ne: true },
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ tenderer: searchRe }, { title: searchRe }] }
        : {}),
      ...(hasDateFilter ? { createdAt: dateFilter } : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    Quotation.find({
      ...(searchRe
        ? { $or: [{ pqNumber: searchRe }, { 'client.company': searchRe }] }
        : {}),
      ...(hasDateFilter ? { createdAt: dateFilter } : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),

    OnlineQuery.find({
      ...(includeDrafts ? {} : { draft: { $ne: true } }),
      ...(countryFilter ? { country: countryFilter } : {}),
      ...(searchRe
        ? { $or: [{ company: searchRe }, { rfqNumber: searchRe }] }
        : {}),
      ...(hasDateFilter ? { date: dateFilter } : {}),
    })
      .limit(200)
      .lean()
      .catch(() => []),
  ]);

  const allRows = [
    ...rfqs.map(normalizeRfq),
    ...tenders.map(normalizeTender),
    ...quotations.map(normalizeQuotation),
    ...onlineQueries.map(normalizeOnlineQuery),
  ];

  let filtered = allRows;
  if (q.stage && q.stage !== 'all') {
    filtered = filtered.filter((r) => r.stage === q.stage);
  }
  if (q.originSource && q.originSource !== 'all') {
    filtered = filtered.filter((r) => r.source === q.originSource);
  }

  filtered.sort(
    (a, b) =>
      new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  return filtered;
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
    const picked = pickUpdatable(dto);

    const dateFields = [
      'lastDateOfPurchase',
      'lastDateOfSubmission',
      'submittedAt',
      'securityValidity',
      'performanceSecurityValidity',
    ];
    for (const f of dateFields) {
      if (picked[f] !== undefined) {
        const d = toDate(picked[f]);
        picked[f] = d || null;
      }
    }

    if (picked.value !== undefined) {
      picked.value = toNumber(picked.value, null);
    }
    if (picked.bidValue !== undefined) {
      picked.bidValue = toNumber(picked.bidValue, 0);
    }
    if (picked.securityAmount !== undefined) {
      picked.securityAmount = toNumber(picked.securityAmount, 0);
    }

    const doc = new OnlineQuery({
      rfqNumber,
      date: dto.date ? new Date(dto.date) : new Date(),
      ...picked,
      company: String(dto.company).trim(),
      country: String(dto.country).trim(),
      draft: dto.draft === true,
      createdBy: userId || null,
    });

    await doc.save();

    try {
      const { Client360Service } = require('../client360/client360.service');
      await Client360Service.autoCaptureFromOnlineQuery(doc, userId);
    } catch (e) {
      console.error(
        '[onlineCrm.service] Client 360 auto-capture failed:',
        e.message
      );
    }

    return toClientShape(doc);
  },

  // ---------- UPDATE ----------
  async updateQuery(id, dto, userId) {
    const doc = await OnlineQuery.findById(id);
    if (!doc) throw ApiError.notFound('Online query not found');

    const picked = pickUpdatable(dto);

    const dateFields = [
      'lastDateOfPurchase',
      'lastDateOfSubmission',
      'submittedAt',
      'securityValidity',
      'performanceSecurityValidity',
    ];
    for (const f of dateFields) {
      if (picked[f] !== undefined) {
        picked[f] = toDate(picked[f]) || null;
      }
    }

    if (picked.value !== undefined) {
      picked.value = toNumber(picked.value, null);
    }
    if (picked.bidValue !== undefined) {
      picked.bidValue = toNumber(picked.bidValue, 0);
    }
    if (picked.securityAmount !== undefined) {
      picked.securityAmount = toNumber(picked.securityAmount, 0);
    }

    for (const [key, value] of Object.entries(picked)) {
      doc[key] = value;
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
    const filter = buildFilter({
      ...q,
      stage: undefined,
      month: undefined,
    });

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
          if (String(r.currency || 'BDT').toUpperCase().includes('USD')) {
            quotedUSD += r.value;
          } else {
            quotedBDT += r.value;
          }
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

  // ---------- MONTHLY VOLUME ----------
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

  // ---------- TOP PRODUCTS ----------
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
  // UNIFIED
  // ============================================================

  async unifiedList(q = {}) {
    const rows = await fetchUnifiedRows(q);

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
  // ============================================================
  // ⭐ DAILY VOLUME — fixed version
  // ============================================================
  async unifiedDailyVolume(q = {}) {
    // ----- 1. Normalize month → 0-11 index -----
    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const rawMonth = q.month;
    let monthIdx = -1;

    // Try as a number first (0-11)
    const asNum = Number(rawMonth);
    if (!Number.isNaN(asNum) && asNum >= 0 && asNum <= 11) {
      monthIdx = asNum;
    } else {
      // Try as a name ("September" / "Sep" / "sept")
      const s = String(rawMonth || '').trim();
      if (s) {
        let idx = MONTH_NAMES.findIndex(
          (m) => m.toLowerCase() === s.toLowerCase()
        );
        if (idx < 0) {
          // Fuzzy — first 3 chars
          const prefix = s.slice(0, 3).toLowerCase();
          idx = MONTH_NAMES.findIndex(
            (m) => m.toLowerCase().slice(0, 3) === prefix
          );
        }
        if (idx >= 0) monthIdx = idx;
      }
    }

    const year = q.year ? Number(q.year) : new Date().getFullYear();

    if (monthIdx < 0) {
      // No valid month → return empty 30-day bucket
      return {
        year,
        month: -1,
        monthName: '',
        days: 30,
        data: new Array(30).fill(0),
      };
    }

    // ----- 2. Compute month window -----
    const monthStart = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59));
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    // ----- 3. Fetch UNFILTERED rows (no month/year filter server-side) -----
    // Strip month/year so fetchUnifiedRows doesn't try to filter by them.
    // We'll do the exact filter below using a date range.
    const fetchedRows = await fetchUnifiedRows({
      ...q,
      month: undefined,
      year: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });

    // ----- 4. Bucket by day of month -----
    const daily = new Array(daysInMonth).fill(0);
    let matchedCount = 0;

    for (const r of fetchedRows) {
      if (!r.date) continue;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;

      // Use UTC for consistency (matches monthStart/monthEnd)
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();

      if (y !== year) continue;
      if (m !== monthIdx) continue;

      const day = d.getUTCDate();          // 1..31
      const idx = day - 1;
      if (idx < 0 || idx >= daily.length) continue;

      daily[idx] += 1;
      matchedCount++;
    }

    // Debug log — remove after confirming it works
    console.log(
      `[unifiedDailyVolume] month=${monthIdx} (${MONTH_NAMES[monthIdx]}) year=${year}`,
      `| fetchedRows=${fetchedRows.length} matched=${matchedCount}`,
      `| window=${monthStart.toISOString()} → ${monthEnd.toISOString()}`
    );

    return {
      year,
      month: monthIdx,
      monthName: MONTH_NAMES[monthIdx],
      days: daysInMonth,
      data: daily,
    };
  },
  // ⭐ UPDATED — returns CRM users array
  async unifiedStats(q = {}, viewer = null) {
    const rows = await fetchUnifiedRows(q);

    let active = 0;
    let quotedBDT = 0;
    let quotedUSD = 0;
    let quotedCount = 0;
    let notQuoted = 0;
    let overdue = 0;

    const overdueThreshold = 15;

    for (const r of rows) {
      active += 1;

      if (r.stage === 'Quoted') {
        quotedCount += 1;
        if (typeof r.value === 'number') {
          if (String(r.currency || 'BDT').toUpperCase().includes('USD')) {
            quotedUSD += r.value;
          } else {
            quotedBDT += r.value;
          }
        }
      }
      if (r.stage === 'Not Quoted') notQuoted += 1;
      if (r.daysAging > overdueThreshold && r.stage !== 'Quoted') overdue += 1;
    }

    // ⭐ Fetch all CRM-division users
    const crmUsers = await fetchCrmUsers();

    // Backward-compatible single name
    const crmManager =
      crmUsers[0]?.name ||
      (viewer?.fullName || viewer?.name || viewer?.email || '').trim() ||
      'Unassigned';

    return {
      activeCount: active,
      quotedValueBDT: quotedBDT,
      quotedValueUSD: quotedUSD,
      quotedCount,
      notQuoted,
      overdue,
      crmManager,
      crmUsers,
      crmUsersCount: crmUsers.length,
      total: rows.length,
    };
  },

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

  async unifiedByCountry(q = {}) {
    const rows = await fetchUnifiedRows({ ...q, month: undefined });

    // ⭐ Support grouping by 'country' (default) or 'source'
    const by = (q.by || 'country').toLowerCase();

    const map = {};
    let total = 0;
    for (const r of rows) {
      let key;
      if (by === 'source') {
        // Group by origin (Email / Phone / Portal / etc.)
        key = r.origin || 'Unknown';
      } else if (by === 'assigned') {
        key = r.assigned || 'Unassigned';
      } else if (by === 'stage') {
        key = r.stage || 'Unknown';
      } else {
        // Default: country
        key = r.country || 'Unknown';
      }
      map[key] = (map[key] || 0) + 1;
      total += 1;
    }

    const entries = Object.entries(map)
      .map(([key, count]) => ({
        // Keep `country` name for backward compat, plus `key`
        country: key,
        key,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { total, by, entries };
  },

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