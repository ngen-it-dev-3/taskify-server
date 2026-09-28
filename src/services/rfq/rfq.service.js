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
    agingDays: d.agingDays,
    stage: d.stage,
    priority: d.priority,
    source: d.source,
    salesman: d.salesman,
    assignedTo: d.assignedTo,
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

  // Start of this month (local time)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Start of last month
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

  // End of last month (last day, 23:59:59)
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

  // ---------- ASSIGN (with emails) ----------
  async assign(id, dto, userId) {
    const doc = await RFQ.findById(id);
    if (!doc) throw ApiError.notFound('RFQ not found');

    const previousAssignee = doc.assignedTo;
    const assignerName = dto.assignedBy || 'CRM Admin';

    doc.assignedTo = dto.assignedTo;
    doc.salesman = dto.assignedTo;
    if (dto.priority) doc.priority = dto.priority;

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

    if (dto.stage) doc.stage = dto.stage;
    if (dto.priority) doc.priority = dto.priority;
    if (dto.assignedTo) {
      doc.assignedTo = dto.assignedTo;
      doc.salesman = dto.assignedTo;
    }
    if (dto.salesman) doc.salesman = dto.salesman;
    if (dto.comment !== undefined) doc.comment = dto.comment;
    if (dto.products) {
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
    // ⭐ Compute month boundaries
    const { startOfThisMonth, startOfLastMonth, endOfLastMonth } =
      getMonthBoundaries();

    const [
      total,
      pending,
      quoted,
      archived,
      lost,
      thisMonth,     // ⭐ NEW
      lastMonth,     // ⭐ NEW
      byCountry,
      bySalesman,
      recent,
    ] = await Promise.all([
      RFQ.countDocuments({}),
      RFQ.countDocuments({ stage: 'pending' }),
      RFQ.countDocuments({ stage: 'quoted' }),
      RFQ.countDocuments({ stage: 'archived' }),
      RFQ.countDocuments({ stage: 'lost' }),
      // ⭐ Count RFQs created this month
      RFQ.countDocuments({
        createdAt: { $gte: startOfThisMonth },
      }),
      // ⭐ Count RFQs created last month
      RFQ.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
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

    // ⭐ Month-over-month delta
    let momDelta = 0;
    if (lastMonth > 0) {
      momDelta = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    } else if (thisMonth > 0) {
      momDelta = 100; // growth from zero
    }

    return {
      total,
      pending,
      quoted,
      archived,
      lost,
      thisMonth,      // ⭐ NEW
      lastMonth,      // ⭐ NEW
      momDelta,       // ⭐ NEW
      quoteRate,
      byCountry: byCountry.map((c) => ({
        country: c._id,
        count: c.count,
        pct: Math.round((c.count / total) * 100),
      })),
      bySalesman: bySalesman.map((s) => ({
        salesman: s._id,
        count: s.count,
      })),
      recent,
    };
  },

  // ---------- SYNC (stub) ----------
  async syncFromWebPortal() {
    return { synced: 0, message: 'Sync endpoint not yet configured.' };
  },
};

module.exports = { RFQService, toClientShape };