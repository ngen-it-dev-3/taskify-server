// src/services/client360/client360.service.js
const Client = require('../../models/Client.model');
const User = require('../../models/User.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
    TIERS,
    SECTORS,
    STAGES,
    AUTO_SOURCES,
} = require('../../models/Client.model');

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

function normalizeKey(name) {
    return String(name || '').trim().toLowerCase();
}

function fmtClient(doc) {
    const d = doc.toObject ? doc.toObject() : doc;

    return {
        id: d._id.toString(),
        name: d.name,
        tier: d.tier,
        isPartner: d.isPartner,
        sector: d.sector,
        location: d.location,
        city: d.city,
        area: d.area,
        country: d.country,

        stage: d.stage,
        assignedRep: d.assignedRep?.toString() || null,
        team: d.team,

        lifetimeValue: d.lifetimeValue,
        ordersFY26: d.ordersFY26,
        avgMarginPct: d.avgMarginPct,
        lastOrderAt: d.lastOrderAt,

        autoAdded: d.autoAdded,
        autoAddedFrom: d.autoAddedFrom,
        sourceRefs: {
            tenderId: d.sourceRefs?.tenderId?.toString() || null,
            rfqId: d.sourceRefs?.rfqId?.toString() || null,
            quotationIds: (d.sourceRefs?.quotationIds || []).map((x) => x.toString()),
            onlineQueryIds: (d.sourceRefs?.onlineQueryIds || []).map((x) => x.toString()),
            forecastEntryIds: (d.sourceRefs?.forecastEntryIds || []).map((x) => x.toString()),
            dmarActivityIds: (d.sourceRefs?.dmarActivityIds || []).map((x) => x.toString()),
        },

        contacts: (d.contacts || []).map((c) => ({
            _id: c._id?.toString(),
            name: c.name,
            designation: c.designation,
            department: c.department,
            email: c.email,
            personalEmail: c.personalEmail,
            phone: c.phone,
            personalPhone: c.personalPhone,
            notes: c.notes,
            isDecisionMaker: !!c.isDecisionMaker,
            autoAdded: !!c.autoAdded,
            linkedIn: c.linkedIn,
        })),

        visitsPerMonth: d.visitsPerMonth,
        lastVisitAt: d.lastVisitAt,
        visitLog: (d.visitLog || []).slice(-10),

        nextAction: d.nextAction,
        projectIds: (d.projectIds || []).map((x) => x.toString()),
        contactIds: (d.contactIds || []).map((x) => x.toString()),

        quotes: (d.quotes || []).map((q) => ({
            _id: q._id?.toString(),
            quotationId: q.quotationId?.toString() || null,
            qtnNumber: q.qtnNumber,
            item: q.item,
            value: q.value,
            status: q.status,
            date: q.date,
        })),

        contracts: (d.contracts || []).map((c) => ({
            _id: c._id?.toString(),
            contractId: c.contractId?.toString() || null,
            title: c.title,
            value: c.value,
            startDate: c.startDate,
            endDate: c.endDate,
            renewalDue: c.renewalDue,
            status: c.status,
        })),

        communicationLog: (d.communicationLog || []).slice(-50),

        notes: d.notes,
        tags: d.tags || [],

        isActive: d.isActive,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
    };
}

function fmtClientLean(doc) {
    const d = doc.toObject ? doc.toObject() : doc;

    return {
        id: d._id.toString(),
        name: d.name,
        tier: d.tier,
        isPartner: d.isPartner,
        sector: d.sector,
        location: d.location,
        city: d.city,
        area: d.area,
        country: d.country,

        stage: d.stage,
        assignedRep: d.assignedRep?.toString() || null,
        team: d.team,

        lifetimeValue: d.lifetimeValue,
        lastOrderAt: d.lastOrderAt,

        autoAdded: d.autoAdded,
        autoAddedFrom: d.autoAddedFrom,

        contacts: (d.contacts || []).map((c) => ({
            _id: c._id?.toString(),
            name: c.name,
            designation: c.designation,
            department: c.department,
            email: c.email,
            personalEmail: c.personalEmail,
            phone: c.phone,
            personalPhone: c.personalPhone,
            notes: c.notes,
            isDecisionMaker: !!c.isDecisionMaker,
            autoAdded: !!c.autoAdded,
            linkedIn: c.linkedIn,
        })),

        quotes: [],
        contracts: [],
        communicationLog: [],
        visitLog: [],
        projectIds: [],
        contactIds: [],

        sourceRefs: {
            tenderId: d.sourceRefs?.tenderId?.toString() || null,
            rfqId: d.sourceRefs?.rfqId?.toString() || null,
            quotationIds: [],
            onlineQueryIds: [],
            forecastEntryIds: [],
            dmarActivityIds: [],
        },

        notes: '',
        tags: d.tags || [],
        isActive: d.isActive,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
    };
}

function buildFilter(q = {}) {
    const filter = { isActive: { $ne: false } };

    if (q.sector && q.sector !== 'all') filter.sector = q.sector;
    if (q.tier && q.tier !== 'all') filter.tier = q.tier;
    if (q.country && q.country !== 'all') filter.country = q.country;
    if (q.stage && q.stage !== 'all') filter.stage = q.stage;
    if (q.team && q.team !== 'all') filter.team = q.team;
    if (q.assignedRep && q.assignedRep !== 'all') filter.assignedRep = q.assignedRep;

    if (q.isPartner === 'true') filter.isPartner = true;
    if (q.isPartner === 'false') filter.isPartner = false;

    if (q.autoAdded === 'true') filter.autoAdded = true;
    if (q.autoAdded === 'false') filter.autoAdded = false;

    if (q.search) {
        const re = new RegExp(q.search, 'i');
        filter.$or = [
            { name: re },
            { sector: re },
            { location: re },
            { city: re },
            { 'contacts.name': re },
            { 'contacts.email': re },
            { 'contacts.phone': re },
        ];
    }

    return filter;
}

// ============================================================
// DEDUP + AUTO-CAPTURE ENGINE
// ============================================================

async function findExistingClient({ name, email, phone }) {
    const ors = [];

    if (name) {
        ors.push({ nameKey: normalizeKey(name) });
    }
    if (email) {
        const e = String(email).trim().toLowerCase();
        ors.push({ 'contacts.email': e });
        ors.push({ 'contacts.personalEmail': e });
    }
    if (phone) {
        const p = String(phone).trim();
        ors.push({ 'contacts.phone': p });
        ors.push({ 'contacts.personalPhone': p });
    }

    if (ors.length === 0) return null;

    return Client.findOne({ $or: ors }).lean();
}

async function upsertClientFromSource({
    name,
    country,
    sector,
    city,
    area,
    tier,
    team,
    contacts = [],
    source,
    sourceRefKey,
    sourceRefValue,
    value = 0,
    notes = '',
    quote = null,
    createdBy = null,
}) {
    if (!name || !String(name).trim()) return null;

    const cleanName = String(name).trim();

    const primaryContact = contacts[0] || {};
    const existing = await findExistingClient({
        name: cleanName,
        email: primaryContact.email,
        phone: primaryContact.phone,
    });

    if (existing) {
        const update = { $addToSet: {} };

        if (sourceRefKey === 'quotationIds' ||
            sourceRefKey === 'onlineQueryIds' ||
            sourceRefKey === 'forecastEntryIds' ||
            sourceRefKey === 'dmarActivityIds') {
            update.$addToSet[`sourceRefs.${sourceRefKey}`] = sourceRefValue;
        } else if (sourceRefKey) {
            update.$set = update.$set || {};
            update.$set[`sourceRefs.${sourceRefKey}`] = sourceRefValue;
        }

        update.$set = update.$set || {};
        if (country && !existing.country) update.$set.country = country;
        if (sector && !existing.sector) update.$set.sector = sector;
        if (city && !existing.city) update.$set.city = city;
        if (area && !existing.area) update.$set.area = area;
        if (tier && (!existing.tier || existing.tier === '')) update.$set.tier = tier;
        if (team && !existing.team) update.$set.team = team;

        if (quote) {
            update.$push = { quotes: quote };
        }

        if (Object.keys(update.$addToSet).length === 0) delete update.$addToSet;

        await Client.updateOne({ _id: existing._id }, update);
        return await Client.findById(existing._id);
    }

    const newClient = new Client({
        name: cleanName,
        nameKey: normalizeKey(cleanName),
        tier: tier || '',
        sector: sector || '',
        country: country || 'Bangladesh',
        city: city || '',
        area: area || '',
        team: team || '',
        contacts,
        autoAdded: source !== 'manual',
        autoAddedFrom: source || 'manual',
        sourceRefs: sourceRefKey ? { [sourceRefKey]: sourceRefValue } : {},
        quotes: quote ? [quote] : [],
        lifetimeValue: value || 0,
        notes: notes || '',
        createdBy: createdBy || null,
        updatedBy: createdBy || null,
    });

    await newClient.save();
    return newClient;
}

// ============================================================
// SERVICE
// ============================================================
const Client360Service = {
    // ============================================================
    // LIST
    // ============================================================
    async listClients(q = {}) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(Number(q.limit) || 50, 1000);
        const skip = (page - 1) * limit;

        const filter = buildFilter(q);

        const projection = [
            'name', 'tier', 'isPartner', 'sector', 'country', 'city', 'area',
            'location', 'stage', 'team', 'assignedRep',
            'lifetimeValue', 'lastOrderAt',
            'autoAdded', 'autoAddedFrom',
            'contacts._id', 'contacts.name', 'contacts.designation',
            'contacts.department', 'contacts.email', 'contacts.personalEmail',
            'contacts.phone', 'contacts.personalPhone', 'contacts.notes',
            'contacts.isDecisionMaker', 'contacts.autoAdded', 'contacts.linkedIn',
            'sourceRefs.tenderId', 'sourceRefs.rfqId',
            'tags', 'isActive', 'createdAt', 'updatedAt',
        ].join(' ');

        const [items, total] = await Promise.all([
            Client.find(filter)
                .select(projection)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Client.countDocuments(filter),
        ]);

        return {
            items: items.map(fmtClientLean),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    },

    // ============================================================
    // GET BY ID
    // ============================================================
    async getById(id) {
        const doc = await Client.findById(id)
            .populate('assignedRep', 'fullName name email profilePhoto');
        if (!doc) throw ApiError.notFound('Client not found');
        return fmtClient(doc);
    },

    // ============================================================
    // STATS
    // ============================================================
    async getStats(q = {}) {
        const filter = buildFilter({
            ...q,
            search: undefined,
            page: undefined,
            limit: undefined,
        });

        const [result] = await Client.aggregate([
            { $match: filter },
            {
                $facet: {
                    totals: [
                        {
                            $group: {
                                _id: null,
                                totalClients: { $sum: 1 },
                                totalPartners: {
                                    $sum: { $cond: ['$isPartner', 1, 0] },
                                },
                                totalContacts: {
                                    $sum: { $size: { $ifNull: ['$contacts', []] } },
                                },
                                potential: {
                                    $sum: {
                                        $cond: [
                                            { $in: ['$stage', ['hot', 'warm']] },
                                            1,
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                    comm: [
                        { $unwind: { path: '$communicationLog', preserveNullAndEmptyArrays: false } },
                        {
                            $group: {
                                _id: '$communicationLog.kind',
                                count: { $sum: 1 },
                            },
                        },
                    ],
                },
            },
        ]);

        const t = (result?.totals && result.totals[0]) || {
            totalClients: 0,
            totalPartners: 0,
            totalContacts: 0,
            potential: 0,
        };

        let called = 0;
        let emailed = 0;
        let presented = 0;
        for (const row of result?.comm || []) {
            if (row._id === 'call') called = row.count;
            else if (row._id === 'email') emailed = row.count;
            else if (row._id === 'meeting' || row._id === 'site-visit')
                presented += row.count;
        }

        return {
            totalClients: t.totalClients || 0,
            totalPartners: t.totalPartners || 0,
            totalContacts: t.totalContacts || 0,
            called,
            emailed,
            presented,
            potential: t.potential || 0,
        };
    },

    // ============================================================
    // SECTOR BREAKDOWN
    // ============================================================
    async getSectorBreakdown(q = {}) {
        const filter = buildFilter({ ...q, search: undefined });
        delete filter.sector;

        const rows = await Client.aggregate([
            { $match: filter },
            { $group: { _id: '$sector', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const entries = rows
            .filter((r) => r._id && String(r._id).trim())
            .map((r) => ({ sector: r._id, count: r.count }));

        return { total: entries.reduce((s, e) => s + e.count, 0), entries };
    },

    // ============================================================
    // CREATE
    // ============================================================
    async createManual(dto, userId) {
        if (!dto.name || !String(dto.name).trim()) {
            throw ApiError.badRequest('Company name is required');
        }

        const client = await upsertClientFromSource({
            name: dto.name,
            country: dto.country || 'Bangladesh',
            sector: dto.sector || '',
            city: dto.city || '',
            area: dto.area || '',
            tier: dto.tier || '',
            team: dto.team || '',
            contacts: dto.contacts || [],
            source: 'manual',
            notes: dto.notes || '',
            createdBy: userId,
        });

        if (dto.isPartner !== undefined || dto.assignedRep || dto.stage) {
            const updates = {};
            if (dto.isPartner !== undefined) updates.isPartner = dto.isPartner;
            if (dto.assignedRep) updates.assignedRep = dto.assignedRep;
            if (dto.stage) updates.stage = dto.stage;
            await Client.updateOne({ _id: client._id }, { $set: updates });
            return this.getById(client._id.toString());
        }

        return fmtClient(client);
    },

    // ============================================================
    // UPDATE
    // ============================================================
    async updateClient(id, dto, userId) {
        const doc = await Client.findById(id);
        if (!doc) throw ApiError.notFound('Client not found');

        const patchable = [
            'name', 'tier', 'isPartner', 'sector', 'location', 'city', 'area',
            'country', 'stage', 'assignedRep', 'team',
            'avgMarginPct', 'notes', 'tags', 'nextAction',
        ];

        for (const key of patchable) {
            if (dto[key] !== undefined) doc[key] = dto[key];
        }

        doc.updatedBy = userId;
        await doc.save();
        return fmtClient(doc);
    },

    // ============================================================
    // DELETE
    // ============================================================
    async deleteClient(id) {
        const doc = await Client.findByIdAndDelete(id);
        if (!doc) throw ApiError.notFound('Client not found');
        return { id };
    },

    // ============================================================
    // CONTACTS
    // ============================================================
    async addContact(clientId, contact, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        doc.contacts.push({
            name: contact.name,
            designation: contact.designation || '',
            department: contact.department || '',
            email: contact.email || '',
            personalEmail: contact.personalEmail || '',
            phone: contact.phone || '',
            personalPhone: contact.personalPhone || '',
            notes: contact.notes || '',
            isDecisionMaker: !!contact.isDecisionMaker,
            linkedIn: contact.linkedIn || '',
        });
        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    async updateContact(clientId, contactId, updates, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const contact = doc.contacts.id(contactId);
        if (!contact) throw ApiError.notFound('Contact not found');

        const allowed = [
            'name', 'designation', 'department', 'email', 'personalEmail',
            'phone', 'personalPhone', 'notes', 'isDecisionMaker', 'linkedIn',
        ];
        for (const k of allowed) {
            if (updates[k] !== undefined) contact[k] = updates[k];
        }
        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    async deleteContact(clientId, contactId, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const contact = doc.contacts.id(contactId);
        if (!contact) throw ApiError.notFound('Contact not found');
        contact.deleteOne();

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ============================================================
    // COMMUNICATION
    // ============================================================
    async addCommunication(clientId, entry, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        doc.communicationLog.push({
            kind: entry.kind || 'note',
            summary: entry.summary || '',
            body: entry.body || '',
            at: entry.at ? new Date(entry.at) : new Date(),
            by: userId || null,
            linkedTo: entry.linkedTo || '',
        });
        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ⭐ NEW: UPDATE COMMUNICATION
    async updateCommunication(clientId, logId, updates, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const log = doc.communicationLog.id(logId);
        if (!log) throw ApiError.notFound('Communication log not found');

        if (updates.kind) log.kind = updates.kind;
        if (updates.summary !== undefined) log.summary = updates.summary;
        if (updates.body !== undefined) log.body = updates.body;
        if (updates.at) log.at = new Date(updates.at);

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ⭐ NEW: DELETE COMMUNICATION
    async deleteCommunication(clientId, logId, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const log = doc.communicationLog.id(logId);
        if (!log) throw ApiError.notFound('Communication log not found');

        log.deleteOne();

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ============================================================
    // AUTO-CAPTURE
    // ============================================================
    async autoCaptureFromTender(tender, userId) {
        if (!tender) return null;
        return upsertClientFromSource({
            name: tender.tenderer,
            country: tender.country || 'Bangladesh',
            sector: 'Government',
            team: 'Sales',
            contacts: [],
            source: 'tender',
            sourceRefKey: 'tenderId',
            sourceRefValue: tender._id,
            value: Number(tender.bidValue || tender.tentativeBudget || 0) || 0,
            notes: `Auto-captured from Tender: ${tender.title || ''}`,
            createdBy: userId,
        });
    },

    async autoCaptureFromRfq(rfq, userId) {
        if (!rfq) return null;
        const contact = {
            name: rfq.contactName || rfq.clientInfo?.contactName || '',
            designation: rfq.designation || rfq.clientInfo?.designation || '',
            email: rfq.email || rfq.clientInfo?.email || '',
            phone: rfq.phone || rfq.clientInfo?.phone || '',
            autoAdded: true,
        };
        return upsertClientFromSource({
            name: rfq.company,
            country: rfq.country || 'Bangladesh',
            city: rfq.city || rfq.clientInfo?.city || '',
            sector: '',
            team: 'Sales',
            contacts: contact.name ? [contact] : [],
            source: 'rfq',
            sourceRefKey: 'rfqId',
            sourceRefValue: rfq._id,
            createdBy: userId,
        });
    },

    async autoCaptureFromQuotation(quotation, userId) {
        if (!quotation || !quotation.client?.company) return null;
        const c = quotation.client;

        const contact = {
            name: c.contactName || '',
            designation: c.designation || '',
            email: c.email || '',
            phone: c.phone || '',
            autoAdded: true,
        };

        return upsertClientFromSource({
            name: c.company,
            country: c.country || quotation.territory || 'Bangladesh',
            city: c.city || '',
            sector: '',
            team: 'Sales',
            contacts: contact.name ? [contact] : [],
            source: 'quotation',
            sourceRefKey: 'quotationIds',
            sourceRefValue: quotation._id,
            value: quotation.totals?.grandTotal || 0,
            quote: {
                quotationId: quotation._id,
                qtnNumber: quotation.pqNumber || '',
                item: quotation.lines?.[0]?.name || '',
                value: quotation.totals?.grandTotal || 0,
                status: quotation.status === 'sent' ? 'Sent' : 'Draft',
                date: quotation.createdAt || new Date(),
            },
            createdBy: userId,
        });
    },

    async autoCaptureFromOnlineQuery(query, userId) {
        if (!query || !query.company) return null;
        return upsertClientFromSource({
            name: query.company,
            country: query.country || 'Bangladesh',
            sector: query.sector || '',
            team: 'Marketing',
            contacts: [],
            source: 'online-crm',
            sourceRefKey: 'onlineQueryIds',
            sourceRefValue: query._id,
            createdBy: userId,
        });
    },

    async autoCaptureFromForecast(entry, userId) {
        if (!entry || !entry.client) return null;
        return upsertClientFromSource({
            name: entry.client,
            country: entry.country || 'Bangladesh',
            team: 'Sales',
            contacts: [],
            source: 'sales-crm',
            sourceRefKey: 'forecastEntryIds',
            sourceRefValue: entry._id,
            value: entry.value || 0,
            createdBy: userId,
        });
    },

    async autoCaptureFromDmar(activity, userId) {
        if (!activity || !activity.company) return null;
        return upsertClientFromSource({
            name: activity.company,
            country: 'Bangladesh',
            sector: activity.sector || '',
            area: activity.area || '',
            team: activity.team || 'Marketing',
            contacts: [],
            source: 'dmar',
            sourceRefKey: 'dmarActivityIds',
            sourceRefValue: activity._id,
            notes: `Auto-captured from DMAR: ${activity.activityType}`,
            createdBy: userId,
        });
    },

    async getClientQuotations(clientId) {
        const client = await Client.findById(clientId).lean();
        if (!client) throw ApiError.notFound('Client not found');

        const Quotation = require('../../models/Quotation.model');

        const re = new RegExp(
            `^${String(client.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i'
        );

        const quotations = await Quotation.find({ 'client.company': re })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return quotations.map((q) => ({
            _id: q._id.toString(),
            quotationId: q._id.toString(),
            qtnNumber: q.pqNumber || '',
            item: q.lines?.[0]?.name || `${q.lines?.length || 0} item(s)`,
            value: q.totals?.grandTotal || 0,
            status:
                q.status === 'sent' ? 'Sent' :
                    q.status === 'won' ? 'Won' :
                        q.status === 'lost' ? 'Lost' :
                            q.status === 'awaiting_approval' ? 'Sent' :
                                'Draft',
            date: q.createdAt || q.updatedAt,
            lines: (q.lines || []).map((l) => ({
                name: l.name,
                qty: l.qty,
                unitPrice: l.principalCost,
            })),
        }));
    },

    // ============================================================
    // QUOTES (⭐ নতুন)
    // ============================================================
    async addQuote(clientId, quoteData, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        doc.quotes.push({
            quotationId: quoteData.quotationId || null,
            qtnNumber: quoteData.qtnNumber || '',
            item: quoteData.item || '',
            value: Number(quoteData.value) || 0,
            status: quoteData.status || 'Draft',
            date: quoteData.date ? new Date(quoteData.date) : new Date(),
        });

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    async updateQuote(clientId, quoteId, updates, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const quote = doc.quotes.id(quoteId);
        if (!quote) throw ApiError.notFound('Quote not found');

        if (updates.qtnNumber !== undefined) quote.qtnNumber = updates.qtnNumber;
        if (updates.item !== undefined) quote.item = updates.item;
        if (updates.value !== undefined) quote.value = Number(updates.value);
        if (updates.status !== undefined) quote.status = updates.status;
        if (updates.date !== undefined) quote.date = new Date(updates.date);

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ============================================================
    // CONTRACTS (⭐ নতুন)
    // ============================================================
    async addContract(clientId, contractData, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        doc.contracts.push({
            contractId: contractData.contractId || null,
            title: contractData.title || '',
            value: Number(contractData.value) || 0,
            startDate: contractData.startDate ? new Date(contractData.startDate) : null,
            endDate: contractData.endDate ? new Date(contractData.endDate) : null,
            renewalDue: contractData.renewalDue ? new Date(contractData.renewalDue) : null,
            status: contractData.status || 'Active',
        });

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    async updateContract(clientId, contractId, updates, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const contract = doc.contracts.id(contractId);
        if (!contract) throw ApiError.notFound('Contract not found');

        if (updates.title !== undefined) contract.title = updates.title;
        if (updates.value !== undefined) contract.value = Number(updates.value);
        if (updates.startDate !== undefined) contract.startDate = updates.startDate ? new Date(updates.startDate) : null;
        if (updates.endDate !== undefined) contract.endDate = updates.endDate ? new Date(updates.endDate) : null;
        if (updates.renewalDue !== undefined) contract.renewalDue = updates.renewalDue ? new Date(updates.renewalDue) : null;
        if (updates.status !== undefined) contract.status = updates.status;

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },
    // ============================================================
    // DELETE QUOTE
    // ============================================================
    async deleteQuote(clientId, quoteId, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const quote = doc.quotes.id(quoteId);
        if (!quote) throw ApiError.notFound('Quote not found');

        quote.deleteOne(); // Mongoose sub-document ডিলিট

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    // ============================================================
    // DELETE CONTRACT
    // ============================================================
    async deleteContract(clientId, contractId, userId) {
        const doc = await Client.findById(clientId);
        if (!doc) throw ApiError.notFound('Client not found');

        const contract = doc.contracts.id(contractId);
        if (!contract) throw ApiError.notFound('Contract not found');

        contract.deleteOne(); // Mongoose sub-document ডিলিট

        doc.updatedBy = userId;
        await doc.save();

        return fmtClient(doc);
    },

    getConstants() {
        return {
            TIERS,
            SECTORS,
            STAGES,
            AUTO_SOURCES,
        };
    },
};

module.exports = {
    Client360Service,
    fmtClient,
    fmtClientLean,
    upsertClientFromSource,
    buildFilter,
};