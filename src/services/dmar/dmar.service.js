// src/services/dmar/dmar.service.js
const DmarActivity = require('../../models/dmar/DmarActivity.model');
const DmarSettings = require('../../models/dmar/DmarSettings.model');
const { User } = require('../../models/User.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
  ACTIVITY_TYPES,
  CLIENT_TYPES,
  TEAMS,
  STATUSES,
  MARKETING_SECTORS,
  SALES_SECTORS,
  ALL_SECTORS,
} = require('../../models/dmar/DmarActivity.model');

const {
  PLAN_KEYS,
} = require('../../models/dmar/DmarSettings.model');

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ============================================================
// HELPERS
// ============================================================

function extractName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    return String(v.fullName || v.name || v.email || '').trim();
  }
  return '';
}

function toClientShape(doc) {
  const d = doc.toObject ? doc.toObject() : doc;

  const daysAging = d.date
    ? Math.max(0, Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000))
    : 0;

  return {
    id: d._id.toString(),
    date: d.date,
    activityType: d.activityType,
    company: d.company,
    clientType: d.clientType,
    product: d.product,
    team: d.team,
    sector: d.sector,
    area: d.area,
    value: d.value,
    status: d.status,
    notes: d.notes,
    followUpDate: d.followUpDate,
    attachments: d.attachments || [],
    syncedTaskId: d.syncedTaskId?.toString() || null,
    client360Id: d.client360Id?.toString() || null,
    crmEntryId: d.crmEntryId?.toString() || null,
    source: d.source,
    loggedBy: d.loggedBy?.toString() || null,
    loggedByName: d.loggedByName || '',
    daysAging,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function buildFilter(q = {}) {
  const filter = {};

  if (q.activityType && q.activityType !== 'all') filter.activityType = q.activityType;
  if (q.clientType && q.clientType !== 'all') filter.clientType = q.clientType;
  if (q.team && q.team !== 'all') filter.team = q.team;
  if (q.sector && q.sector !== 'all') filter.sector = q.sector;
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.loggedBy && q.loggedBy !== 'all') filter.loggedBy = q.loggedBy;

  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [
      { company: re },
      { product: re },
      { area: re },
      { notes: re },
    ];
  }

  if (q.dateFrom || q.dateTo) {
    filter.date = {};
    if (q.dateFrom) filter.date.$gte = new Date(q.dateFrom);
    if (q.dateTo) filter.date.$lte = new Date(q.dateTo);
  }

  // Month + year
  if (q.month !== undefined && q.month !== null && q.month !== '' && q.month !== 'all') {
    const monthIdx = MONTHS.indexOf(q.month);
    if (monthIdx >= 0) {
      const year = Number(q.year) || new Date().getFullYear();
      filter.date = {
        $gte: new Date(year, monthIdx, 1),
        $lte: new Date(year, monthIdx + 1, 0, 23, 59, 59),
      };
    }
  }

  return filter;
}

// ============================================================
// SERVICE
// ============================================================
const DmarService = {
  // ============================================================
  // ACTIVITIES — LIST
  // ============================================================
  async listActivities(q = {}) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Number(q.limit) || 100, 500);
    const skip = (page - 1) * limit;

    const filter = buildFilter(q);

    const [items, total] = await Promise.all([
      DmarActivity.find(filter)
        .populate('loggedBy', 'fullName name email profilePhoto')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      DmarActivity.countDocuments(filter),
    ]);

    return {
      items: items.map(toClientShape),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // ============================================================
  // ACTIVITIES — GET BY ID
  // ============================================================
  async getActivityById(id) {
    const doc = await DmarActivity.findById(id)
      .populate('loggedBy', 'fullName name email profilePhoto');
    if (!doc) throw ApiError.notFound('Activity not found');
    return toClientShape(doc);
  },

  // ============================================================
  // ACTIVITIES — CREATE
  // ============================================================
  async createActivity(dto, userId) {
    if (!dto.company || !String(dto.company).trim()) {
      throw ApiError.badRequest('Company name is required');
    }
    if (!dto.activityType) {
      throw ApiError.badRequest('Activity type is required');
    }
    if (!ACTIVITY_TYPES.includes(dto.activityType)) {
      throw ApiError.badRequest(`Invalid activity type: ${dto.activityType}`);
    }

    // Resolve the logger name
    let loggedByName = '';
    try {
      const u = await User.findById(userId).select('fullName name email').lean();
      loggedByName = extractName(u);
    } catch { /* ignore */ }

    const doc = new DmarActivity({
      date: dto.date ? new Date(dto.date) : new Date(),
      activityType: dto.activityType,
      company: String(dto.company).trim(),
      clientType: dto.clientType || 'New',
      product: dto.product || '',
      team: dto.team || 'Marketing',
      sector: dto.sector || '',
      area: dto.area || '',
      value:
        dto.value === undefined || dto.value === null || dto.value === ''
          ? null
          : Number(dto.value),
      status: dto.status || 'To Start',
      notes: dto.notes || '',
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      attachments: dto.attachments || [],
      source: dto.source || 'manual',
      loggedBy: userId,
      loggedByName,
      createdBy: userId,
    });

    await doc.save();

    // ⭐ Auto-sync to My Tasks (stub — extend when task sync service exists)
    //    await TaskSyncService.createFromActivity(doc);

    // ⭐ Auto-create/link Client 360 entry (stub)
    //    await Client360Service.linkCompany(doc.company);

    return toClientShape(doc);
  },

  // ============================================================
  // ACTIVITIES — UPDATE
  // ============================================================
  async updateActivity(id, dto, userId) {
    const doc = await DmarActivity.findById(id);
    if (!doc) throw ApiError.notFound('Activity not found');

    const patchable = [
      'activityType', 'company', 'clientType', 'product',
      'team', 'sector', 'area', 'value', 'status',
      'notes', 'attachments', 'source',
    ];

    for (const key of patchable) {
      if (dto[key] !== undefined) doc[key] = dto[key];
    }

    if (dto.date) doc.date = new Date(dto.date);
    if (dto.followUpDate !== undefined) {
      doc.followUpDate = dto.followUpDate ? new Date(dto.followUpDate) : null;
    }

    doc.updatedBy = userId;
    await doc.save();
    return toClientShape(doc);
  },

  // ============================================================
  // ACTIVITIES — MARK AS SOLD
  // ============================================================
  async markSold(id, userId) {
    const doc = await DmarActivity.findById(id);
    if (!doc) throw ApiError.notFound('Activity not found');

    doc.status = 'Sold';
    doc.updatedBy = userId;
    await doc.save();
    return toClientShape(doc);
  },

  // ============================================================
  // ACTIVITIES — DELETE
  // ============================================================
  async removeActivity(id) {
    const doc = await DmarActivity.findByIdAndDelete(id);
    if (!doc) throw ApiError.notFound('Activity not found');
    return { id };
  },

  // ============================================================
  // STATS — DMAR Total + KPI cards
  // ============================================================
  async getStats(q = {}) {
    const filter = buildFilter({ ...q, activityType: 'all', status: 'all' });
    const rows = await DmarActivity.find(filter).lean();

    let total = 0;
    let visited = 0;
    let called = 0;
    let emailed = 0;
    let posted = 0;
    let social = 0;
    let meeting = 0;
    let quotedCount = 0;
    let soldCount = 0;
    let quotedValue = 0;
    let soldValue = 0;

    for (const r of rows) {
      total += 1;

      switch (r.activityType) {
        case 'Visited': visited += 1; break;
        case 'Called': called += 1; break;
        case 'Emailed': emailed += 1; break;
        case 'Posted': posted += 1; break;
        case 'Social': social += 1; break;
        case 'Meeting': meeting += 1; break;
      }

      if (r.status === 'Quoted') {
        quotedCount += 1;
        quotedValue += r.value || 0;
      }
      if (r.status === 'Sold') {
        soldCount += 1;
        soldValue += r.value || 0;
      }
    }

    // Monthly target
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const month = q.month && q.month !== 'all' ? q.month : MONTHS[new Date().getMonth()];
    const settings = await DmarSettings.findOne({ year, month, team: 'Both' }).lean();
    const salesTarget = settings?.salesTarget || 0;

    // Overall DMAR target = planned activities
    const planTotal = settings?.plan?.reduce((s, p) => s + (p.planned || 0), 0) || 0;
    const dmarTarget = planTotal > 0 ? planTotal : total;   // fall back

    return {
      total,
      visited,
      called,
      emailed,
      posted,
      social,
      meeting,
      quoted: quotedCount,
      sold: soldCount,
      quotedValue,
      soldValue,
      salesTarget,
      dmarTarget,
      // For "DMAR Total 186 / 90% of 207 target" display
      dmarPct: dmarTarget > 0 ? Math.round((total / dmarTarget) * 100) : 0,
      salesPct: salesTarget > 0 ? Math.round((soldValue / salesTarget) * 100) : 0,
    };
  },

  // ============================================================
  // SECTOR-WISE VISITS (Marketing / Sales toggle)
  // ============================================================
  async getSectorVisits(q = {}) {
    const team = q.team === 'Sales' ? 'Sales' : 'Marketing';

    const filter = buildFilter({
      ...q,
      team,
      activityType: 'Visited',
      status: 'all',
    });

    const rows = await DmarActivity.find(filter).lean();

    const sectorList = team === 'Sales' ? SALES_SECTORS : MARKETING_SECTORS;
    const map = {};
    sectorList.forEach((s) => { map[s] = 0; });

    for (const r of rows) {
      const key = r.sector || 'Other';
      map[key] = (map[key] || 0) + 1;
    }

    const entries = Object.entries(map)
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);

    return {
      team,
      total: rows.length,
      sectors: entries,
    };
  },

  // ============================================================
  // MONTHLY PLAN — actual vs planned
  // ============================================================
  async getMonthlyPlan(q = {}) {
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const month = q.month && q.month !== 'all' ? q.month : MONTHS[new Date().getMonth()];

    // Fetch the plan
    const settings = await DmarSettings.findOne({ year, month, team: 'Both' }).lean();
    const plan = settings?.plan || [];

    // Fetch actuals for the month
    const monthIdx = MONTHS.indexOf(month);
    const dateFrom = new Date(year, monthIdx, 1);
    const dateTo = new Date(year, monthIdx + 1, 0, 23, 59, 59);

    const actuals = await DmarActivity.aggregate([
      { $match: { date: { $gte: dateFrom, $lte: dateTo } } },
      { $group: { _id: '$activityType', count: { $sum: 1 } } },
    ]);

    const actualMap = {};
    actuals.forEach((a) => { actualMap[a._id] = a.count; });

    // Map activity types to plan keys
    // "Site Visit" + "Client Visit" both count as Visited
    // "Telephone" = Called, "Email" = Emailed, "Social" = Social
    const visitedActual = actualMap['Visited'] || 0;
    const calledActual = actualMap['Called'] || 0;
    const emailedActual = actualMap['Emailed'] || 0;
    const socialActual = actualMap['Social'] || 0;

    const planMap = {};
    plan.forEach((p) => { planMap[p.key] = p.planned || 0; });

    const rows = [
      {
        key: 'Site Visit',
        planned: planMap['Site Visit'] || 0,
        actual: Math.floor(visitedActual / 2) || 0,   // rough split
      },
      {
        key: 'Client Visit',
        planned: planMap['Client Visit'] || 0,
        actual: Math.ceil(visitedActual / 2) || 0,
      },
      {
        key: 'Telephone',
        planned: planMap['Telephone'] || 0,
        actual: calledActual,
      },
      {
        key: 'Email',
        planned: planMap['Email'] || 0,
        actual: emailedActual,
      },
      {
        key: 'Social',
        planned: planMap['Social'] || 0,
        actual: socialActual,
      },
    ];

    return {
      year,
      month,
      rows,
      salesTarget: settings?.salesTarget || 0,
    };
  },

  // ============================================================
  // SETTINGS — UPSERT MONTHLY PLAN
  // ============================================================
  async upsertSettings(dto, userId) {
    const { year, month, team = 'Both', salesTarget = 0, plan = [] } = dto;

    if (!year || !month) {
      throw ApiError.badRequest('year and month are required');
    }

    const doc = await DmarSettings.findOneAndUpdate(
      { year, month, team },
      {
        $set: {
          year,
          month,
          team,
          salesTarget,
          plan,
          updatedBy: userId,
        },
      },
      { new: true, upsert: true }
    );

    return doc;
  },

  // ============================================================
  // DISTINCT TEAM MEMBERS (for filter dropdown)
  // ============================================================
  async getTeamMembers() {
    const docs = await DmarActivity.distinct('loggedBy');
    const users = await User.find(
      { _id: { $in: docs } },
      { fullName: 1, name: 1, email: 1, profilePhoto: 1 }
    ).lean();

    return users.map((u) => ({
      id: u._id.toString(),
      name: u.fullName || u.name || u.email || 'Unknown',
      profilePhoto: u.profilePhoto || null,
    }));
  },

  // ============================================================
  // CONSTANTS — for the frontend modal
  // ============================================================
  getConstants() {
    return {
      ACTIVITY_TYPES,
      CLIENT_TYPES,
      TEAMS,
      STATUSES,
      MARKETING_SECTORS,
      SALES_SECTORS,
      ALL_SECTORS,
      PLAN_KEYS,
    };
  },
};

module.exports = { DmarService, toClientShape };