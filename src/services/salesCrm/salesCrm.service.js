// src/services/salesCrm/salesCrm.service.js
const ForecastEntry = require('../../models/salesCrm/Forecast.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
    PIPELINE_STAGES,
    MONTHS,
} = require('../../models/salesCrm/Forecast.model');

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
        owner: d.owner,

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
// BUILD MONGO FILTER FROM QUERY STRING
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
    // ---------- CREATE ----------
    /**
     * Used by:
     *   - the "Add Forecast Entry" modal (source: manual / offline)
     *   - QuotationService.send() auto-push (source: 'quotation-builder')
     */
    async createEntry(dto, userId) {
        // Basic validation
        if (!dto.client || !String(dto.client).trim()) {
            throw ApiError.badRequest('Client is required');
        }

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
            owner: dto.owner || '',

            quotationId: dto.quotationId || null,
            rfqId: dto.rfqId || null,
            rfqNumber: dto.rfqNumber || '',
            pqNumber: dto.pqNumber || '',

            monthlyTarget: Number(dto.monthlyTarget) || 0,
            createdBy: userId || null,
        });

        await doc.save();
        return toClientShape(doc);
    },

    // ---------- LIST (with filters) ----------
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

    // ---------- GET BY ID ----------
    async getById(id) {
        const doc = await ForecastEntry.findById(id);
        if (!doc) throw ApiError.notFound('Forecast entry not found');
        return toClientShape(doc);
    },

    // ---------- UPDATE ----------
    async updateEntry(id, dto, userId) {
        const doc = await ForecastEntry.findById(id);
        if (!doc) throw ApiError.notFound('Forecast entry not found');

        const patchable = [
            'client', 'item', 'value', 'probability', 'month', 'stage',
            'source', 'note', 'country', 'region', 'owner',
            'deliveredAt', 'invoicedAt', 'executedAt', 'closedAt', 'monthlyTarget',
        ];

        for (const key of patchable) {
            if (dto[key] !== undefined) doc[key] = dto[key];
        }

        // Clamp probability again in case it changed
        if (doc.probability < 0) doc.probability = 0;
        if (doc.probability > 100) doc.probability = 100;

        doc.updatedBy = userId || null;
        await doc.save();
        return toClientShape(doc);
    },

    // ---------- DELETE ----------
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

    // ---------- PIPELINE (6 columns) ----------
    async getPipeline(q = {}) {
        const filter = buildFilter({ ...q, month: undefined, stage: undefined }); // pipeline shows all stages

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
                owner: r.owner,
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

    // ---------- FORECAST KPIs ----------
    async getForecastKpis(q = {}) {
        const filter = buildFilter(q);
        const rows = await ForecastEntry.find(filter).lean();

        let quoted = 0;       // all "open + closed quotes" (quotation + negotiation)
        let closedWon = 0;    // stage = won
        let weighted = 0;     // Σ (value × probability / 100)
        let lost = 0;         // stage = lost
        let wonCount = 0;
        let lostCount = 0;

        for (const r of rows) {
            const val = r.value || 0;
            const prob = r.probability || 0;

            if (r.stage === 'quotation' || r.stage === 'negotiation') {
                quoted += val;
            }
            if (r.stage === 'won') {
                closedWon += val;
                wonCount += 1;
            }
            if (r.stage === 'lost') {
                lost += val;
                lostCount += 1;
            }
            weighted += Math.round((val * prob) / 100);
        }

        const winRate =
            wonCount + lostCount > 0
                ? Math.round((wonCount / (wonCount + lostCount)) * 100)
                : 0;

        return {
            quoted,
            closedWon,
            weighted,
            lost,
            winRate,
            counts: { won: wonCount, lost: lostCount, total: rows.length },
        };
    },

    // ---------- FORECAST TREND (monthly bars) ----------
    async getForecastTrend(q = {}) {
        const filter = buildFilter({ ...q, month: undefined }); // trend across all months
        const rows = await ForecastEntry.find(filter).lean();

        const trend = MONTHS.map((m) => ({
            month: m,
            closed: 0,         // won
            open: 0,           // quotation + negotiation
            noActivity: true,
        }));

        const byMonth = {};
        for (const r of rows) {
            const m = r.month;
            if (!m) continue;
            if (!byMonth[m]) byMonth[m] = { closed: 0, open: 0 };
            if (r.stage === 'won') byMonth[m].closed += r.value || 0;
            if (r.stage === 'quotation' || r.stage === 'negotiation')
                byMonth[m].open += r.value || 0;
        }

        return trend.map((t) => {
            const stats = byMonth[t.month] || { closed: 0, open: 0 };
            return {
                month: t.month,
                closed: stats.closed,
                open: stats.open,
                noActivity: stats.closed === 0 && stats.open === 0,
            };
        });
    },

    // ---------- BREAKDOWN (by country | stage | source) ----------
    async getBreakdown(q = {}, by = 'country') {
        const filter = buildFilter({ ...q, month: undefined });
        const rows = await ForecastEntry.find(filter).lean();

        const buckets = {};
        let total = 0;

        for (const r of rows) {
            let key = 'Unknown';
            if (by === 'country') key = r.country || 'Unknown';
            else if (by === 'stage') key = r.stage || 'Unknown';
            else if (by === 'source') key = r.source || 'Unknown';
            else if (by === 'owner') key = r.owner || 'Unassigned';

            if (!buckets[key]) buckets[key] = 0;
            buckets[key] += r.value || 0;
            total += r.value || 0;
        }

        const entries = Object.entries(buckets)
            .map(([key, value]) => ({
                key,
                value,
                pct: total > 0 ? Math.round((value / total) * 100) : 0,
            }))
            .sort((a, b) => b.value - a.value);

        return { total, by, entries };
    },

    // ---------- BY SALESPERSON ----------
    async getBySalesperson(q = {}) {
        const filter = buildFilter({ ...q, month: undefined });
        const rows = await ForecastEntry.find(filter).lean();

        const map = {};
        let grandTotal = 0;
        let grandCount = 0;

        for (const r of rows) {
            const owner = r.owner || 'Unassigned';
            if (!map[owner]) {
                map[owner] = {
                    name: owner,
                    total: 0,
                    count: 0,
                    entries: [],
                };
            }
            map[owner].total += r.value || 0;
            map[owner].count += 1;
            map[owner].entries.push({
                id: r._id.toString(),
                client: r.client,
                stage: r.stage,
                value: r.value,
            });

            grandTotal += r.value || 0;
            grandCount += 1;
        }

        const people = Object.values(map).sort((a, b) => b.total - a.total);

        return {
            total: grandTotal,
            count: grandCount,
            people,
        };
    },

    // ---------- SALES REPORT (FY26 target vs achieved) ----------
    async getSalesReport(q = {}) {
        const filter = buildFilter({ ...q, month: undefined });
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
            if (r.stage === 'won' || r.deliveredAt || r.invoicedAt || r.executedAt) {
                byMonth[i].achieved += r.value || 0;
            }
            byMonth[i].entries.push({
                id: r._id.toString(),
                pqNumber: r.pqNumber,
                owner: r.owner,
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
    // ⭐ AUTO-PUSH FROM QUOTATION BUILDER
    // Called from QuotationService.send() after status = 'sent'
    // ============================================================
    async pushFromQuotation({ quotation, rfq, userId }) {
        if (!quotation) throw ApiError.badRequest('Quotation required');

        // ⭐ Idempotency: don't create duplicate forecast entries
        //    for the same quotation
        const existing = await ForecastEntry.findOne({
            quotationId: quotation._id,
        });
        if (existing) {
            console.log(
                `📈 Forecast already exists for ${quotation.pqNumber} — skipping`
            );
            return toClientShape(existing);
        }

        // Derive probability from stage — matches sales-process conventions
        const stageProbMap = {
            query: 20,
            rfq: 40,
            quotation: 60,
            negotiation: 75,
            won: 100,
            lost: 0,
        };
        const probability = stageProbMap['quotation'] || 60;

        const doc = new ForecastEntry({
            client:
                quotation.client?.company ||
                rfq?.company ||
                'Unknown Client',
            item:
                quotation.lines?.[0]?.name ||
                `${quotation.lines?.length || 0} item(s)`,
            value: quotation.totals?.grandTotal || 0,
            probability,
            month: MONTHS[new Date().getMonth()],
            stage: 'quotation',
            source: 'quotation-builder',
            note: `Auto-pushed from ${quotation.pqNumber}`,

            country: quotation.client?.country || rfq?.country || 'Bangladesh',
            region: quotation.client?.country || rfq?.country || 'Bangladesh',
            owner:
                quotation.crmManager ||
                rfq?.assignedTo ||
                rfq?.salesman ||
                '',

            quotationId: quotation._id,
            rfqId: rfq?._id || quotation.rfqId,
            rfqNumber: quotation.rfqNumber || rfq?.rfqNumber || '',
            pqNumber: quotation.pqNumber,

            createdBy: userId || null,
        });

        await doc.save();
        console.log(
            `📈 Forecast entry created for ${quotation.pqNumber} (৳${doc.value.toLocaleString()})`
        );

        return toClientShape(doc);
    },
};

module.exports = { SalesCrmService, toClientShape };