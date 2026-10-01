// src/services/salesCrm/salesCrm.service.js
const ForecastEntry = require('../../models/salesCrm/Forecast.model');
const User = require('../../models/User.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
    PIPELINE_STAGES,
    MONTHS,
} = require('../../models/salesCrm/Forecast.model');

// ============================================================
// OWNER HELPERS
// ============================================================

function extractOwnerName(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object') {
        return String(v.fullName || v.name || v.email || '').trim();
    }
    return '';
}

/**
 * ⭐ Resolve an owner field which might be:
 *   - a plain string             → return it
 *   - a populated user object    → extract name
 *   - an ObjectId (or {_id})     → fetch user, extract name
 */
async function resolveOwnerField(v) {
    if (!v) return '';

    // Plain string
    if (typeof v === 'string') return v.trim();

    // Populated user object
    if (typeof v === 'object' && (v.fullName || v.name || v.email)) {
        return extractOwnerName(v);
    }

    // ObjectId — try to fetch
    if (typeof v === 'object') {
        const id = v._id || v;
        const idStr = id && typeof id.toString === 'function' ? id.toString() : '';

        if (/^[a-f\d]{24}$/i.test(idStr)) {
            try {
                const user = await User.findById(id)
                    .select('fullName name email')
                    .lean();
                return extractOwnerName(user);
            } catch {
                return '';
            }
        }
    }

    return '';
}

// ============================================================
// SHAPE FOR FRONTEND
// ============================================================
function toClientShape(doc) {
    const d = doc.toObject ? doc.toObject() : doc;

    return {
        id: d._id.toString(),
        client: d.client,
        item: d.item,
        value: d.value,
        probability: d.probability,
        weightedValue: Math.round(((d.value || 0) * (d.probability || 0)) / 100),
        month: d.month,
        stage: d.stage,
        source: d.source,
        note: d.note,

        country: d.country,
        region: d.region,
        owner: extractOwnerName(d.owner) || (typeof d.owner === 'string' ? d.owner : ''),

        quotationId: d.quotationId?.toString() || null,
        rfqId: d.rfqId?.toString() || null,
        rfqNumber: d.rfqNumber,
        pqNumber: d.pqNumber,

        deliveredAt: d.deliveredAt,
        invoicedAt: d.invoicedAt,
        executedAt: d.executedAt,
        closedAt: d.closedAt,
        monthlyTarget: d.monthlyTarget,

        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
    };
}

// ============================================================
// BUILD MONGO FILTER
// ============================================================
function buildFilter(q = {}) {
    const filter = {};

    if (q.month && q.month !== 'all') filter.month = q.month;
    if (q.stage && q.stage !== 'all') filter.stage = q.stage;
    if (q.source && q.source !== 'all') filter.source = q.source;
    if (q.owner && q.owner !== 'all') filter.owner = q.owner;
    if (q.country && q.country !== 'all') filter.country = q.country;
    if (q.region && q.region !== 'all') filter.region = q.region;

    if (q.search) {
        const re = new RegExp(q.search, 'i');
        filter.$or = [
            { client: re },
            { item: re },
            { pqNumber: re },
            { rfqNumber: re },
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
// SERVICE
// ============================================================
const SalesCrmService = {
    async createEntry(dto, userId) {
        if (!dto.client || !String(dto.client).trim()) {
            throw ApiError.badRequest('Client is required');
        }

        const fallbackOwner = await resolveOwnerField(userId);

        const doc = new ForecastEntry({
            client: String(dto.client).trim(),
            item: dto.item || '',
            value: Number(dto.value) || 0,
            probability:
                dto.probability === undefined || dto.probability === null
                    ? 50
                    : Math.max(0, Math.min(100, Number(dto.probability))),
            month: dto.month || MONTHS[new Date().getMonth()],
            stage: dto.stage || 'quotation',
            source: dto.source || 'offline',
            note: dto.note || '',

            country: dto.country || 'Bangladesh',
            region: dto.region || dto.country || 'Bangladesh',
            owner: dto.owner || fallbackOwner,

            quotationId: dto.quotationId || null,
            rfqId: dto.rfqId || null,
            rfqNumber: dto.rfqNumber || '',
            pqNumber: dto.pqNumber || '',

            monthlyTarget: Number(dto.monthlyTarget) || 0,
            createdBy: userId?._id || userId || null,
        });

        await doc.save();
        return toClientShape(doc);
    },

    async listEntries(q = {}) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(Number(q.limit) || 100, 500);
        const skip = (page - 1) * limit;

        const filter = buildFilter(q);
        const sort = { createdAt: -1 };

        const [items, total] = await Promise.all([
            ForecastEntry.find(filter).sort(sort).skip(skip).limit(limit),
            ForecastEntry.countDocuments(filter),
        ]);

        return {
            items: items.map(toClientShape),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    },

    async getById(id) {
        const doc = await ForecastEntry.findById(id);
        if (!doc) throw ApiError.notFound('Forecast entry not found');
        return toClientShape(doc);
    },

    async updateEntry(id, dto, userId) {
        const doc = await ForecastEntry.findById(id);
        if (!doc) throw ApiError.notFound('Forecast entry not found');

        const previousStage = doc.stage;

        const patchable = [
            'client', 'item', 'value', 'probability', 'month', 'stage',
            'source', 'note', 'country', 'region', 'owner',
            'deliveredAt', 'invoicedAt', 'executedAt', 'closedAt', 'monthlyTarget',
        ];

        for (const key of patchable) {
            if (dto[key] !== undefined) doc[key] = dto[key];
        }
        // ... probability clamp ...
        doc.updatedBy = userId?._id || userId || null;
        await doc.save();

        // ⭐ NEW: if stage changed TO 'won', create Sales Order
        if (doc.stage === 'won' && previousStage !== 'won') {
            try {
                const { SalesOrderService } = require('../salesOrder/salesOrder.service');
                await SalesOrderService.createFromWon({
                    source: 'sales-crm',
                    forecastEntry: doc,
                    userId,
                });
            } catch (e) {
                console.error('[salesCrm.updateEntry] Sales Order creation failed:', e.message);
            }
        }

        return toClientShape(doc);
    },

    async removeEntry(id) {
        const doc = await ForecastEntry.findByIdAndDelete(id);
        if (!doc) throw ApiError.notFound('Forecast entry not found');
        return { id };
    },

    async bulkRemove(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw ApiError.badRequest('No ids provided');
        }
        const result = await ForecastEntry.deleteMany({ _id: { $in: ids } });
        return { deletedCount: result.deletedCount || 0 };
    },

    async getPipeline(q = {}) {
        const filter = buildFilter({ ...q, month: undefined, stage: undefined });
        const rows = await ForecastEntry.find(filter).lean();

        const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
            acc[stage] = [];
            return acc;
        }, {});

        for (const r of rows) {
            if (!grouped[r.stage]) grouped[r.stage] = [];
            grouped[r.stage].push({
                id: r._id.toString(),
                client: r.client,
                item: r.item,
                value: r.value,
                probability: r.probability,
                month: r.month,
                stage: r.stage,
                source: r.source,
                country: r.country,
                owner: extractOwnerName(r.owner) || r.owner || '',
                pqNumber: r.pqNumber,
            });
        }

        return {
            stages: PIPELINE_STAGES,
            columns: grouped,
            totals: PIPELINE_STAGES.reduce((acc, stage) => {
                acc[stage] = grouped[stage].reduce((sum, x) => sum + (x.value || 0), 0);
                return acc;
            }, {}),
        };
    },

    async getForecastKpis(q = {}) {
        const filter = buildFilter(q);
        const rows = await ForecastEntry.find(filter).lean();

        let quoted = 0, closedWon = 0, weighted = 0, lost = 0;
        let wonCount = 0, lostCount = 0;

        for (const r of rows) {
            const val = r.value || 0;
            const prob = r.probability || 0;

            if (r.stage === 'quotation' || r.stage === 'negotiation') quoted += val;
            if (r.stage === 'won') { closedWon += val; wonCount += 1; }
            if (r.stage === 'lost') { lost += val; lostCount += 1; }
            weighted += Math.round((val * prob) / 100);
        }

        const winRate =
            wonCount + lostCount > 0
                ? Math.round((wonCount / (wonCount + lostCount)) * 100)
                : 0;

        return {
            quoted, closedWon, weighted, lost, winRate,
            counts: { won: wonCount, lost: lostCount, total: rows.length },
        };
    },

    async getForecastTrend(q = {}) {
        const MONTH_FULL_TO_SHORT = {
            January: 'Jan', February: 'Feb', March: 'Mar',
            April: 'Apr', May: 'May', June: 'Jun',
            July: 'Jul', August: 'Aug', September: 'Sep',
            October: 'Oct', November: 'Nov', December: 'Dec',
        };
        const normalizeMonth = (m) => {
            if (!m) return null;
            if (MONTHS.includes(m)) return m;
            const short = MONTH_FULL_TO_SHORT[m];
            if (short) return short;
            const prefix = String(m).slice(0, 3).toLowerCase();
            return MONTHS.find((x) => x.toLowerCase() === prefix) || null;
        };

        const rawMonth = q.month && q.month !== 'all' ? String(q.month).trim() : null;
        const selectedMonth = normalizeMonth(rawMonth) || MONTHS[new Date().getMonth()];
        const monthIdx = MONTHS.indexOf(selectedMonth);
        const year = Number(q.year) || new Date().getFullYear();

        const firstDay = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59));
        const daysInMonth = lastDay.getUTCDate();

        const filter = {};
        if (q.country && q.country !== 'all') filter.country = q.country;
        if (q.region && q.region !== 'all') filter.region = q.region;
        if (q.owner && q.owner !== 'all') filter.owner = q.owner;
        if (q.stage && q.stage !== 'all') filter.stage = q.stage;

        filter.createdAt = { $gte: firstDay, $lte: lastDay };
        const rows = await ForecastEntry.find(filter).lean();

        const buckets = Array.from({ length: daysInMonth }, (_, i) => ({
            key: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
            label: String(i + 1).padStart(2, '0'),
            month: selectedMonth,
            closed: 0, open: 0, noActivity: true,
        }));

        for (const r of rows) {
            if (!r.createdAt) continue;
            const d = new Date(r.createdAt);
            if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIdx) continue;

            const dayIdx = d.getUTCDate() - 1;
            if (dayIdx < 0 || dayIdx >= buckets.length) continue;

            if (r.stage === 'won') buckets[dayIdx].closed += r.value || 0;
            if (['query', 'rfq', 'quotation', 'negotiation'].includes(r.stage))
                buckets[dayIdx].open += r.value || 0;
        }

        return buckets.map((b) => ({
            ...b,
            noActivity: b.closed === 0 && b.open === 0,
        }));
    },

    async getBreakdown(q = {}, by = 'country') {
        const filter = buildFilter(q);
        const rows = await ForecastEntry.find(filter).lean();

        const buckets = {};
        let total = 0;

        for (const r of rows) {
            let key = 'Unknown';
            if (by === 'country') key = r.country || 'Unknown';
            else if (by === 'stage') key = r.stage || 'Unknown';
            else if (by === 'source') key = r.source || 'Unknown';
            else if (by === 'owner') key = extractOwnerName(r.owner) || 'Unassigned';

            if (!buckets[key]) buckets[key] = 0;
            buckets[key] += r.value || 0;
            total += r.value || 0;
        }

        const entries = Object.entries(buckets)
            .map(([key, value]) => ({
                key, value,
                pct: total > 0 ? Math.round((value / total) * 100) : 0,
            }))
            .sort((a, b) => b.value - a.value);

        return { total, by, entries };
    },

    // ---------- BY SALESPERSON (leaderboard) ----------
    async getBySalesperson(q = {}) {
        // ⭐ month + other filters flow through via buildFilter
        const filter = buildFilter(q);
        const rows = await ForecastEntry.find(filter).lean();

        const map = {};
        let grandTotal = 0;
        let grandCount = 0;
        let grandWon = 0;
        let grandLost = 0;
        let grandOpen = 0;

        for (const r of rows) {
            const owner = extractOwnerName(r.owner) || 'Unassigned';

            if (!map[owner]) {
                map[owner] = {
                    name: owner,
                    // totals
                    total: 0,          // all value
                    wonValue: 0,       // value of won entries
                    openValue: 0,      // value of open (query/rfq/quotation/negotiation)
                    lostValue: 0,      // value of lost entries
                    weighted: 0,       // probability-adjusted
                    // counts
                    count: 0,          // all entries
                    wonCount: 0,
                    lostCount: 0,
                    openCount: 0,
                    // derived
                    winRate: 0,
                    avgDealSize: 0,
                    entries: [],
                };
            }

            const bucket = map[owner];
            const val = r.value || 0;
            const prob = r.probability || 0;

            bucket.total += val;
            bucket.count += 1;
            bucket.weighted += Math.round((val * prob) / 100);

            if (r.stage === 'won') {
                bucket.wonValue += val;
                bucket.wonCount += 1;
                grandWon += val;
            } else if (r.stage === 'lost') {
                bucket.lostValue += val;
                bucket.lostCount += 1;
                grandLost += val;
            } else {
                // query | rfq | quotation | negotiation
                bucket.openValue += val;
                bucket.openCount += 1;
                grandOpen += val;
            }

            bucket.entries.push({
                id: r._id.toString(),
                client: r.client,
                item: r.item,
                stage: r.stage,
                value: val,
                probability: prob,
                month: r.month,
                createdAt: r.createdAt,
            });

            grandTotal += val;
            grandCount += 1;
        }

        // Finalize derived fields per person
        const people = Object.values(map).map((p) => {
            const decided = p.wonCount + p.lostCount;
            const winRate = decided > 0 ? Math.round((p.wonCount / decided) * 100) : 0;
            const avgDealSize = p.count > 0 ? Math.round(p.total / p.count) : 0;
            return { ...p, winRate, avgDealSize };
        });

        // Sort by won value desc, then open value desc, then total
        people.sort((a, b) => {
            if (b.wonValue !== a.wonValue) return b.wonValue - a.wonValue;
            if (b.openValue !== a.openValue) return b.openValue - a.openValue;
            return b.total - a.total;
        });

        const totalDecided = people.reduce((s, p) => s + p.wonCount + p.lostCount, 0);
        const totalWonCount = people.reduce((s, p) => s + p.wonCount, 0);
        const overallWinRate =
            totalDecided > 0 ? Math.round((totalWonCount / totalDecided) * 100) : 0;

        return {
            total: grandTotal,
            count: grandCount,
            won: grandWon,
            lost: grandLost,
            open: grandOpen,
            winRate: overallWinRate,
            people,
        };
    },

    // ---------- SALES REPORT (FY26 target vs achieved) ----------
    async getSalesReport(q = {}) {
        // ⭐ Force stage = 'won' — Sales Report is a WON-only report
        const filter = buildFilter({ ...q, month: undefined, stage: 'won' });

        const rows = await ForecastEntry.find(filter).lean();

        const byMonth = MONTHS.map((m) => ({
            month: m,
            target: 0,
            achieved: 0,
            entries: [],
        }));

        const monthIndex = MONTHS.reduce((acc, m, i) => {
            acc[m] = i;
            return acc;
        }, {});

        for (const r of rows) {
            const i = monthIndex[r.month];
            if (i === undefined) continue;

            byMonth[i].target = Math.max(byMonth[i].target, r.monthlyTarget || 0);
            byMonth[i].achieved += r.value || 0;

            byMonth[i].entries.push({
                id: r._id.toString(),
                pqNumber: r.pqNumber,
                owner: extractOwnerName(r.owner) || r.owner || '',
                client: r.client,
                item: r.item,
                value: r.value,
                stage: r.stage,
                deliveredAt: r.deliveredAt,
                invoicedAt: r.invoicedAt,
                executedAt: r.executedAt,
            });
        }

        const totalTarget = byMonth.reduce((s, m) => s + m.target, 0);
        const totalAchieved = byMonth.reduce((s, m) => s + m.achieved, 0);

        return {
            fiscalYear: 'FY26',
            months: byMonth,
            totalTarget,
            totalAchieved,
            achievementPct:
                totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0,
        };
    },


    // ============================================================
    // AUTO-PUSH WON TENDER TO FORECAST
    // ============================================================
    async pushFromTender({ tender, userId, userName }) {
        if (!tender) throw ApiError.badRequest('Tender required');

        // Idempotency — skip if already pushed
        const existing = await ForecastEntry.findOne({
            $or: [
                { source: 'tender', note: { $regex: new RegExp(String(tender._id), 'i') } },
            ],
        });
        if (existing) {
            console.log(`📈 Forecast already exists for tender ${tender._id} — skipping`);
            return toClientShape(existing);
        }

        // Resolve owner name
        const resolvedOwner =
            extractOwnerName(tender.owner) ||
            extractOwnerName(tender.responsiblePerson) ||
            extractOwnerName(tender.recordedBy) ||
            extractOwnerName(userName) ||
            (await resolveOwnerField(userId)) ||
            '';

        // Bucket by the won date
        const wonAt = tender.wonAt || tender.updatedAt || new Date();
        const monthLabel = MONTHS[new Date(wonAt).getMonth()];

        const doc = new ForecastEntry({
            client: tender.tenderer || 'Unknown Tenderer',
            item: tender.title || 'Tender',
            value: Number(tender.bidValue || tender.tentativeBudget || 0),
            probability: 100,
            month: monthLabel,
            stage: 'won',
            source: 'tender',
            note: `Auto-pushed from Won Tender — ${tender._id}`,

            country: tender.country || 'Bangladesh',
            region: tender.country || 'Bangladesh',
            owner: resolvedOwner,

            createdBy: userId?._id || userId || null,
        });

        await doc.save();

        // ⭐ Auto-capture to Client 360
        try {
            const { Client360Service } = require('../client360/client360.service');
            await Client360Service.autoCaptureFromForecast(doc, userId);
        } catch (e) {
            console.error('[salesCrm.service] Client 360 auto-capture failed:', e.message);
        }

        console.log(
            `📈 Forecast entry created for ${quotation.pqNumber} (৳${doc.value.toLocaleString()}) — owner: "${resolvedOwner || '(blank)'}"`
        );

        return toClientShape(doc);
    },

    // ============================================================
    // AUTO-PUSH FROM QUOTATION BUILDER
    // ============================================================
    async pushFromQuotation({ quotation, rfq, userId, userName }) {
        if (!quotation) throw ApiError.badRequest('Quotation required');

        const existing = await ForecastEntry.findOne({
            quotationId: quotation._id,
        });
        if (existing) {
            console.log(`📈 Forecast already exists for ${quotation.pqNumber} — skipping`);
            return toClientShape(existing);
        }

        const stageProbMap = {
            query: 20, rfq: 40, quotation: 60,
            negotiation: 75, won: 100, lost: 0,
        };
        const probability = stageProbMap['quotation'] || 60;

        // ⭐ Resolve owner with maximum fallbacks
        const resolvedOwner =
            (await resolveOwnerField(quotation.crmManager)) ||
            (await resolveOwnerField(quotation.createdBy)) ||
            extractOwnerName(quotation.salesman) ||
            extractOwnerName(quotation.assignedTo) ||
            (await resolveOwnerField(rfq?.assignedTo)) ||
            extractOwnerName(rfq?.salesman) ||
            (userName && String(userName).trim()) ||      // ⭐ auth user name
            (await resolveOwnerField(userId)) ||
            '';

        const doc = new ForecastEntry({
            client: quotation.client?.company || rfq?.company || 'Unknown Client',
            item: quotation.lines?.[0]?.name || `${quotation.lines?.length || 0} item(s)`,
            value: quotation.totals?.grandTotal || 0,
            probability,
            month: MONTHS[new Date().getMonth()],
            stage: 'quotation',
            source: 'quotation-builder',
            note: `Auto-pushed from ${quotation.pqNumber}`,

            country: quotation.client?.country || rfq?.country || 'Bangladesh',
            region: quotation.client?.country || rfq?.country || 'Bangladesh',
            owner: resolvedOwner,
            // Quotation and RFQ references for traceability
            quotationId: quotation._id,
            rfqId: rfq?._id || quotation.rfqId,
            rfqNumber: quotation.rfqNumber || rfq?.rfqNumber || '',
            pqNumber: quotation.pqNumber,

            createdBy: userId?._id || userId || null,
        });

        await doc.save();
        console.log(
            `📈 Forecast entry created for ${quotation.pqNumber} (৳${doc.value.toLocaleString()}) — owner: "${resolvedOwner || '(blank)'}"`
        );

        return toClientShape(doc);
    },
};

module.exports = { SalesCrmService, toClientShape };