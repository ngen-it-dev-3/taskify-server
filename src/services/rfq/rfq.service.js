// src/services/rfq/rfq.service.js

const RFQ = require('../../models/rfq/RFQ');
const Counter = require('../../models/rfq/Counter');
const { ApiError } = require('../../utils/rfq/ApiError');
const { sendMail } = require('../../utils/sendEmail');
const {
  assignedToSalesmanTemplate,
  assignedToClientTemplate,
} = require('./rfq.email.templates');

// ============================================================
// ⭐ HELPER: Format raw DB slugs into clean labels
// ============================================================
function formatDisplayName(name) {
  if (!name) return 'Unknown';
  const lower = String(name).toLowerCase();
  if (lower === 'quotation-builder' || lower === 'quotation builder') return 'Quotations';
  if (lower === 'tender') return 'Tenders';
  if (lower === 'rfq') return 'RFQs';

  // Capitalize and remove dashes for any other string
  return String(name).charAt(0).toUpperCase() + String(name).slice(1).replace(/-/g, ' ');
}

// ============================================================
// EMAIL SENDER — wraps sendMail with logging + safe-fail
// ============================================================
async function sendMailSafe(opts) {
  try {
    await sendMail(opts);
    console.log(`📧 RFQ email sent → ${opts.to} · "${opts.subject}"`);
  } catch (err) {
    console.error(`❌ RFQ email failed → ${opts.to}:`, err.message);
  }
}

// ============================================================
// EMAIL LOOKUP — salesperson name → email
// ============================================================
const SALES_REP_EMAILS = {
  'Nahid Hasan': 'nahid@ngenitltd.com',
  'Akramul': 'akramul@ngenitltd.com',
  'CRM Manager, ME': 'crm.me@ngenitltd.com',
  'Wei Ling Tan': 'weiling@ngenitltd.com',
};

async function resolveRepEmail(name) {
  if (!name || name === 'Unassigned') return null;
  try {
    const { User } = require('../../models/User.model');
    const user = await User.findOne({ fullName: name }).select('email').lean();
    if (user?.email) return user.email;
  } catch {
    // silent — User model field names may differ
  }
  return SALES_REP_EMAILS[name] || null;
}

// ============================================================
// SHAPE FOR FRONTEND
// ============================================================
function toClientShape(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    rfqNumber: d.rfqNumber,
    company: d.company,
    country: d.country,
    date: d.date,
    time: d.time,
    inquiryDate: d.inquiryDate,
    agingDays: d.agingDays,
    stage: d.stage,
    priority: d.priority,
    source: d.source,
    salesman: d.salesman,
    assignedTo: d.assignedTo,
    territory: d.territory || '',
    currency: d.currency || 'BDT',
    exchangeRate: d.exchangeRate || 1,
    clientInfo: {
      contactName: d.contactName,
      email: d.email,
      phone: d.phone || '',
      company: d.company,
      country: d.country,
      zipCode: d.zipCode || '',
      tentativeBudget: d.tentativeBudget || '—',
      purchaseDate: d.tentativePurchaseDate || '—',
      designation: d.designation || '',
      address: d.address || '',
      city: d.city || '',
    },
    products: (d.products || []).map((p) => ({
      name: p.name,
      qty: p.qty,
      spec: p.spec,
      sku: p.sku,
      modelNo: p.modelNo,
      brand: p.brand,
      description: p.description,
      additionalInfo: p.additionalInfo,
      files: p.files,
    })),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ============================================================
// FILTER BUILDER
// ============================================================
function buildFilter(q, includeArchived) {
  const filter = {};

  // ---- Stage filter (priority order) ----
  if (q.stage) {
    filter.stage = q.stage;
  } else if (includeArchived) {
    filter.stage = 'archived';
  } else {
    filter.stage = { $nin: ['archived', 'lost'] };
  }

  if (q.country) filter.country = q.country;
  if (q.salesman) filter.salesman = q.salesman;
  if (q.source) filter.source = q.source;

  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [{ company: re }, { rfqNumber: re }, { email: re }];
  }

  if (q.dateFrom || q.dateTo) {
    filter.createdAt = {};
    if (q.dateFrom) filter.createdAt.$gte = new Date(q.dateFrom);
    if (q.dateTo) filter.createdAt.$lte = new Date(q.dateTo);
  }

  return filter;
}

// ============================================================
// RFQ NUMBER GENERATOR
// ============================================================
async function generateRfqNumber(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `rfq-${yy}${mm}${dd}`;

  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${yy}${mm}${dd}-${counter.seq}`;
}

// ============================================================
// DATE HELPERS FOR STATS
// ============================================================
function getMonthBoundaries(referenceDate = new Date()) {
  const now = referenceDate;
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  return { startOfThisMonth, startOfLastMonth, endOfLastMonth };
}

// ============================================================
// SERVICE
// ============================================================
const RFQService = {
  // ---------- CREATE ----------
  async create(dto, userId) {
    const rfqNumber = await generateRfqNumber();
    const now = new Date();

    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new RFQ({
      rfqNumber,
      source: dto.source || 'manual',
      company: dto.company,
      country: dto.country,
      date: dateStr,
      time: timeStr,
      agingDays: 0,
      stage: 'pending',
      priority: dto.priority || 'normal',
      salesman: dto.salesman || dto.assignedTo || 'Unassigned',
      assignedTo: dto.assignedTo || 'Unassigned',
      receivedVia: dto.receivedVia,
      inquiryDate: dto.inquiryDate || new Date(),
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
      designation: dto.designation,
      address: dto.address,
      city: dto.city,
      zipCode: dto.zipCode,
      isReseller: dto.isReseller || false,

      projectName: dto.projectName,
      tentativeBudget: dto.tentativeBudget,
      currentProjectStatus: dto.currentProjectStatus,
      tentativePurchaseDate: dto.tentativePurchaseDate,
      comment: dto.comment,

      products: (dto.products || []).map((p, i) => ({ ...p, sl: p.sl || i + 1 })),

      assignmentHistory:
        dto.assignedTo && dto.assignedTo !== 'Unassigned'
          ? [{ assignedTo: dto.assignedTo, assignedBy: userId, assignedAt: now }]
          : [],

      createdBy: userId,
    });

    await doc.save();

    try {
      const { Client360Service } = require('../client360/client360.service');
      await Client360Service.autoCaptureFromRfq(doc, userId);
    } catch (e) {
      console.error('[rfq.service] Client 360 auto-capture failed:', e.message);
    }

    return toClientShape(doc);
  },

  // ---------- LIST ----------
  async list(q, includeArchived) {
    const page = Number(q.page) || 1;
    const limit = Math.min(Number(q.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = buildFilter(q, includeArchived);
    const sort = {};
    const sortBy = q.sortBy || 'createdAt';
    sort[sortBy] = q.sortOrder === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      RFQ.find(filter).sort(sort).skip(skip).limit(limit),
      RFQ.countDocuments(filter),
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
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');
    return toClientShape(doc);
  },

  // ---------- ASSIGN ----------
  async assign(id, dto, userId) {
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');

    const previousAssignee = doc.assignedTo;
    const assignerName = dto.assignedBy || 'CRM Admin';

    doc.assignedTo = dto.assignedTo;
    doc.salesman = dto.assignedTo;
    if (dto.priority) doc.priority = dto.priority;

    if (dto.territory) {
      doc.territory = dto.territory;
      doc.markModified('territory');
    }

    doc.assignmentHistory.push({
      assignedTo: dto.assignedTo,
      assignedBy: userId,
      assignedAt: new Date(),
      notes: dto.notes,
    });

    doc.updatedBy = userId;
    await doc.save();

    const rfqPlain = doc.toObject();

    resolveRepEmail(dto.assignedTo).then((repEmail) => {
      if (!repEmail) {
        console.warn(`[rfq.assign] no email on file for "${dto.assignedTo}"`);
        return;
      }
      sendMailSafe({
        to: repEmail,
        subject: `[RFQ ${doc.rfqNumber}] New RFQ assigned — ${doc.company} (${doc.country})`,
        html: assignedToSalesmanTemplate({
          rfq: rfqPlain,
          assignedTo: dto.assignedTo,
          assignedBy: assignerName,
          notes: dto.notes,
          priority: dto.priority || doc.priority,
        }),
      });
    });

    if (previousAssignee !== dto.assignedTo && doc.email) {
      sendMailSafe({
        to: doc.email,
        subject: `Your RFQ ${doc.rfqNumber} has been assigned`,
        html: assignedToClientTemplate({
          rfq: rfqPlain,
          assignedTo: dto.assignedTo,
        }),
      });
    }

    return toClientShape(doc);
  },

  // ---------- UPDATE ----------
  async update(id, dto, userId) {
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');

    // ⭐ 1. Update Company & Contact Info
    if (dto.company) doc.company = dto.company;
    if (dto.country) doc.country = dto.country;
    if (dto.contactName) doc.contactName = dto.contactName;
    if (dto.email) doc.email = dto.email;
    if (dto.phone) doc.phone = dto.phone;
    if (dto.designation) doc.designation = dto.designation;
    if (dto.address) doc.address = dto.address;
    if (dto.city) doc.city = dto.city;
    if (dto.zipCode) doc.zipCode = dto.zipCode;
    if (dto.isReseller !== undefined) doc.isReseller = dto.isReseller;

    // ⭐ 2. Update Additional Details
    if (dto.projectName !== undefined) doc.projectName = dto.projectName;
    if (dto.tentativeBudget !== undefined) doc.tentativeBudget = dto.tentativeBudget;
    if (dto.currentProjectStatus !== undefined) doc.currentProjectStatus = dto.currentProjectStatus;
    if (dto.tentativePurchaseDate !== undefined) doc.tentativePurchaseDate = dto.tentativePurchaseDate;
    if (dto.comment !== undefined) doc.comment = dto.comment;
    if (dto.inquiryDate !== undefined) doc.inquiryDate = dto.inquiryDate;
    // ⭐ 3. Update Status & Assignment
    if (dto.stage) doc.stage = dto.stage;
    if (dto.priority) doc.priority = dto.priority;
    if (dto.assignedTo) {
      doc.assignedTo = dto.assignedTo;
      doc.salesman = dto.assignedTo;
    }
    if (dto.salesman) doc.salesman = dto.salesman;

    // ⭐ 4. Update Products
    if (dto.products && Array.isArray(dto.products)) {
      doc.products = dto.products.map((p, i) => ({ ...p, sl: p.sl || i + 1 }));
    }

    doc.updatedBy = userId;
    await doc.save();

    return toClientShape(doc);
  },

  // ---------- ARCHIVE / UNARCHIVE ----------
  async archive(id, userId) {
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');
    doc.stage = 'archived';
    doc.updatedBy = userId;
    await doc.save();
    return toClientShape(doc);
  },

  async unarchive(id, userId) {
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');
    doc.stage = 'pending';
    doc.updatedBy = userId;
    await doc.save();
    return toClientShape(doc);
  },

  // ---------- DELETE ----------
  async remove(id) {
    const doc = await RFQ.findByIdAndDelete(id);
    if (!doc) throw ApiError.notFound('RFQ not found');
    return { id };
  },

  // ---------- DASHBOARD STATS ----------
  async stats() {
    const { startOfThisMonth, startOfLastMonth, endOfLastMonth } =
      getMonthBoundaries();

    const [
      total,
      pending,
      quoted,
      archived,
      lost,
      thisMonth,
      lastMonth,
      byCountry,
      bySalesman,
      recent,
    ] = await Promise.all([
      RFQ.countDocuments({}),
      RFQ.countDocuments({ stage: 'pending' }),
      RFQ.countDocuments({ stage: 'quoted' }),
      RFQ.countDocuments({ stage: 'archived' }),
      RFQ.countDocuments({ stage: 'lost' }),
      RFQ.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      RFQ.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      // ⭐ Using formatDisplayName so the frontend NEVER sees raw slugs
      RFQ.aggregate([
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      RFQ.aggregate([
        { $group: { _id: '$salesman', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      RFQ.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('company rfqNumber createdAt'),
    ]);

    const quoteRate = total > 0 ? Math.round((quoted / total) * 100) : 0;

    let momDelta = 0;
    if (lastMonth > 0) {
      momDelta = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    } else if (thisMonth > 0) {
      momDelta = 100;
    }

    return {
      total,
      pending,
      quoted,
      archived,
      lost,
      thisMonth,
      lastMonth,
      momDelta,
      quoteRate,

      // ⭐ Apply formatting to the aggregated results
      byCountry: byCountry.map((c) => ({
        country: formatDisplayName(c._id),
        count: c.count,
        pct: Math.round((c.count / total) * 100),
      })),

      bySalesman: bySalesman.map((s) => ({
        salesman: formatDisplayName(s._id),
        count: s.count,
      })),

      recent,
    };
  },

  // ---------- SYNC ----------
  async syncFromWebPortal() {
    return { synced: 0, message: 'Sync endpoint not yet configured.' };
  },
};

module.exports = { RFQService, toClientShape };