// src/services/rfq/rfq.service.js
const axios = require('axios');
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
// ⭐ HELPER: Escape regex special characters safely
// ============================================================
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    rfqReferenceId: d.rfqReferenceId || '',
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
    rfqSource: d.rfqSource || '',
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
    const re = new RegExp(escapeRegex(q.search.trim()), 'i');
    filter.$or = [
      { company: re },
      { rfqNumber: re },
      { rfqReferenceId: re },
      { email: re },
    ];
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
      rfqReferenceId: dto.rfqReferenceId ? String(dto.rfqReferenceId).trim() : '',
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
      rfqSource: dto.rfqSource || '',
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

    // ⭐ সমাধান: লেটেস্ট ইনকোয়ারি ডেটা বা তারিখ অনুযায়ী সাজানোর জন্য 'inquiryDate' বা 'createdAt' ব্যবহার করা
    const sort = {};
    const sortBy = q.sortBy || 'inquiryDate';
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
    if (dto.rfqSource !== undefined) doc.rfqSource = dto.rfqSource;
    if (dto.rfqReferenceId !== undefined) {
      doc.rfqReferenceId = String(dto.rfqReferenceId).trim();
    }

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
        .select('company rfqNumber rfqReferenceId createdAt'),
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
        pct: total > 0 ? Math.round((c.count / total) * 100) : 0,
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
    const API_URL = process.env.NGEN_API_URL;
    const API_TOKEN = process.env.NGEN_API_TOKEN;

    if (!API_URL || !API_TOKEN) {
      throw new Error('NGEN_API_URL or NGEN_API_TOKEN is missing in .env');
    }

    let page = 1;
    let hasNextPage = true;
    let syncedCount = 0;
    let syncedItems = [];

    // ⭐ সমাধান: ডাটাবেজ থেকে সর্বশেষ সিঙ্ক হওয়া রেকর্ডটির সময় বের করা (Incremental Sync)
    let updatedAfter = null;
    const lastRecord = await RFQ.findOne({ ngen_id: { $exists: true } }).sort({ ngen_updated_at: -1 });

    if (lastRecord && lastRecord.ngen_updated_at) {
      // ২ মিনিট ওভারল্যাপ টাইমসহ ISO স্ট্রিং তৈরি করা যাতে কোনো আপডেট মিস না হয়
      const overlapTime = new Date(lastRecord.ngen_updated_at.getTime() - 2 * 60000);
      updatedAfter = overlapTime.toISOString();
    }

    while (hasNextPage) {
      try {
        const response = await axios.get(`${API_URL}/rfqs`, {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: 'application/json',
          },
          params: {
            page,
            limit: 100,
            ...(updatedAfter ? { updatedAfter } : {}), // 👈 নতুন বা আপডেট হওয়া ডেটা ফিল্টার করবে
          },
          timeout: 60000,
        });

        const payload = response.data;
        const records = payload.data || [];

        // যদি কোনো নতুন রেকর্ড না থাকে, তবে লুপ ভেঙে বের হয়ে যাবো
        if (records.length === 0) {
          hasNextPage = false;
          break;
        }

        for (const record of records) {
          const savedData = await this.upsertNgenRfq(record);
          syncedCount++;
          if (savedData) {
            syncedItems.push(savedData);
          }
        }

        hasNextPage = payload.pagination?.hasNextPage || false;
        page++;
      } catch (error) {
        console.error('❌ NGEN Sync Error:', error.response?.data || error.message);
        throw new Error('Failed to sync from NGEN API');
      }
    }

    return {
      synced: syncedCount,
      items: syncedItems,
      message: `Successfully synced ${syncedCount} new/updated records.`,
    };
  },

  // ⭐ Helper: NGEN এর ডাটাকে আপনার DB ফরম্যাটে রূপান্তর ও সেভ করা
  // ⭐ Helper: NGEN এর ডাটাকে আপনার DB ফরম্যাটে রূপান্তর ও সেভ করা
  async upsertNgenRfq(r) {
    // 1. আসল সময় নির্ধারণ: r.date + r.time থাকলে সেটিকে +06:00 (Dhaka) ধরব, নাহলে r.createdAt (UTC) ব্যবহার করব
    let exactCreatedDate;
    if (r.date && r.time && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date).trim())) {
      exactCreatedDate = new Date(`${String(r.date).trim()}T${String(r.time).trim()}+06:00`);
    } else {
      exactCreatedDate = r.createdAt ? new Date(r.createdAt) : new Date();
    }

    if (isNaN(exactCreatedDate.getTime())) {
      exactCreatedDate = new Date();
    }

    // 2. সবসময় Asia/Dhaka টাইমজোনে date এবং time ফরম্যাট করা (যেমন: 22 Nov 2026 ও 03:17 PM)
    const dateStr = exactCreatedDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dhaka',
    });
    const timeStr = exactCreatedDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dhaka',
    });

    const agingDays = Math.floor(
      (Date.now() - exactCreatedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const updateData = {
      ngen_id: String(r._id),
      rfqNumber: r.rfqNumber ? `${r.rfqNumber}-${r._id}` : `NGEN-${r._id}`,
      rfqReferenceId:
        r.rfqReferenceId ||
        r.referenceId ||
        r.rfqNumber ||
        `REF-${r._id}`,
      company: r.company || r.clientName || 'Unknown Company',
      country: r.country || r.clientCountry || 'Unknown',
      date: dateStr,
      time: timeStr,
      // ⭐ আসল সময়সহ Date অবজেক্ট সেভ করা, যাতে ফ্রন্টএন্ডে 06:00 AM না দেখায়
      inquiryDate: exactCreatedDate,
      agingDays: Number.isNaN(agingDays) ? 0 : agingDays,
      stage: r.stage || 'pending',
      priority: r.priority || 'normal',
      salesman: r.salesman || 'Unassigned',
      assignedTo: r.assignedTo || 'Unassigned',
      contactName: r.contactName || 'Unknown',
      email: r.email || 'unknown@example.com',
      phone: r.phone || '',
      designation: r.designation || '',
      address: r.address || '',
      city: r.city || '',
      zipCode: r.zipCode || '',
      isReseller: r.isReseller || false,
      projectName: r.projectName || '',
      tentativeBudget: r.tentativeBudget || '',
      currentProjectStatus: r.currentProjectStatus || '',
      tentativePurchaseDate: r.tentativePurchaseDate || '',
      comment: r.comment || '',
      source: 'online',
      receivedVia: 'Other',
      ngen_updated_at: r.updatedAt ? new Date(r.updatedAt) : new Date(),

      // Nested objects
      shipping: r.shipping ? {
        companyName: r.shipping.companyName || r.shipping.company || '',
        contactName: r.shipping.contactName || r.shipping.name || '',
        email: r.shipping.email || '',
        phone: r.shipping.phone || '',
        address: r.shipping.address || '',
        country: r.shipping.country || '',
        city: r.shipping.city || '',
        zipCode: r.shipping.zipCode || '',
      } : undefined,

      endUser: r.endUser ? {
        companyName: r.endUser.companyName || r.endUser.company || '',
        contactName: r.endUser.contactName || r.endUser.name || '',
        email: r.endUser.email || '',
        phone: r.endUser.phone || '',
        address: r.endUser.address || '',
        country: r.endUser.country || '',
        city: r.endUser.city || '',
        zipCode: r.endUser.zipCode || '',
      } : undefined,

      // Products array
      products: (r.products || []).map((p, i) => ({
        sl: p.sl || i + 1,
        name: p.name || 'Unknown Product',
        qty: p.qty || 1,
        spec: p.spec || '',
        sku: p.sku || '',
        modelNo: p.modelNo || '',
        brand: p.brand || '',
        description: p.description || '',
        additionalInfo: p.additionalInfo || '',
        files: [],
      })),
    };

    await RFQ.updateOne(
      { ngen_id: String(r._id) },
      { $set: updateData },
      { upsert: true }
    );
    return updateData;
  },
};

module.exports = { RFQService, toClientShape };