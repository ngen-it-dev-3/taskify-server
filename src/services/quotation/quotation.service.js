// src/services/quotation/quotation.service.js
const Quotation = require('../../models/Quotation.model');
const RFQ = require('../../models/rfq/RFQ');
const { SalesCrmService } = require('../salesCrm/salesCrm.service');   // ⭐ NEW
const { ApiError } = require('../../utils/rfq/ApiError');
const { generatePqNumber } = require('../../utils/quotationNumber');
const { sendMail } = require('../../utils/sendEmail');
const {
    quotationSentTemplate,
} = require('./quotation.email.templates');

// ============================================================
// CALCULATE TOTALS
// ============================================================
function computeTotals(lines, rates, meta = {}) {
    let costOfGoods = 0;
    let officeExpenses = 0;
    let commissionOthers = 0;
    let netProfit = 0;

    let subTotal = 0;
    let discountTotal = 0;
    let customerPrice = 0;
    let totalWeight = 0;

    const principalRate = 1 - (rates.principalDiscountPct || 0) / 100;
    const discountEnabled = meta.discountEnabled !== false;
    const taxEnabled = meta.vatEnabled !== false;
    const taxPct = rates.taxPct || 0;

    for (const l of lines || []) {
        const effectiveCost = (l.principalCost || 0) * principalRate;
        const lineTotal = (l.qty || 0) * effectiveCost;
        const weight = (l.qty || 0) * (l.weightKg || 0);

        const office = (lineTotal * (rates.officePct || 0)) / 100;
        const profit = (lineTotal * (rates.profitPct || 0)) / 100;
        const others = (lineTotal * (rates.othersPct || 0)) / 100;

        const sub = lineTotal + office + profit + others;

        const appliedPct = discountEnabled ? (l.discountPct || 0) : 0;
        const discountAmt = sub * (appliedPct / 100);
        const discounted = sub - discountAmt;

        costOfGoods += lineTotal;
        officeExpenses += office;
        commissionOthers += others;
        netProfit += profit;
        subTotal += sub;
        discountTotal += discountAmt;
        customerPrice += discounted;
        totalWeight += weight;
    }

    const taxVatGst =
        !taxEnabled || taxPct === 0
            ? 0
            : (customerPrice * taxPct) / 100;

    const grandTotal = customerPrice + taxVatGst;

    return {
        costOfGoods,
        officeExpenses,
        commissionOthers,
        netProfit,
        subTotal,
        discountTotal,
        customerPrice,
        taxVatGst,
        grandTotal,
        totalWeight,
    };
}

// ============================================================
// SHAPE FOR FRONTEND
// ============================================================
function toClientShape(doc) {
    const d = doc.toObject ? doc.toObject() : doc;
    return {
        id: d._id.toString(),
        pqNumber: d.pqNumber,
        status: d.status,
        stage: d.stage,
        rfqId: d.rfqId?.toString() || '',
        rfqNumber: d.rfqNumber,
        client: d.client || {},
        clientType: d.clientType,
        territory: d.territory,
        crmManager: d.crmManager,
        currency: d.currency,
        currencySymbol: d.currencySymbol,
        exchangeRate: d.exchangeRate,
        vatEnabled: d.vatEnabled,
        discountEnabled: d.discountEnabled,
        pqrNumber: d.pqrNumber,
        lines: d.lines || [],
        rates: d.rates || {},
        logistics: d.logistics || {},
        terms: d.terms || [],
        totals: d.totals || {},
        sentAt: d.sentAt,
        approvedAt: d.approvedAt,
        closedAt: d.closedAt,
        validUntil: d.validUntil,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
    };
}

// ============================================================
// HELPER: cascade stage change to parent RFQ
// ============================================================
async function syncRfqStage(rfqId, stage, userId) {
    if (!rfqId) return;
    try {
        await RFQ.updateOne(
            { _id: rfqId, stage: { $nin: ['archived'] } },
            { $set: { stage, updatedBy: userId } }
        );
        console.log(`🔗 RFQ ${rfqId} stage → ${stage}`);
    } catch (e) {
        console.error(`[quotation.syncRfqStage] failed to update RFQ ${rfqId}:`, e.message);
    }
}

// ============================================================
// HELPER: auto-push quotation to Sales CRM Forecast
//   Fire-and-forget — never blocks or fails the send flow
//
//   ⭐ FIXED: now accepts and forwards `userName` so the forecast
//             entry can fall back to the logged-in user when the
//             RFQ / quotation has no assigned owner.
// ============================================================
function pushToForecastSafely(quotationDoc, userId, userName) {
    if (!quotationDoc) return;

    setImmediate(async () => {
        try {
            const rfq = quotationDoc.rfqId
                ? await RFQ.findById(quotationDoc.rfqId).lean()
                : null;

            await SalesCrmService.pushFromQuotation({
                quotation: quotationDoc,
                rfq,
                userId,
                userName,   // ⭐ NEW — forwarded to forecast service
            });
        } catch (e) {
            console.error(
                `[quotation.pushToForecastSafely] failed for ${quotationDoc.pqNumber}:`,
                e.message
            );
        }
    });
}

// ============================================================
// SERVICE
// ============================================================
const QuotationService = {
    // ---------- CREATE ----------
    async create(dto, userId) {
        const rfq = await RFQ.findById(dto.rfqId);
        if (!rfq) throw ApiError.notFound('RFQ not found');

        const countryCode = (rfq.country || 'XX').slice(0, 2).toUpperCase();
        const initials = (rfq.company || 'XX').replace(/[^A-Za-z]/g, '').slice(0, 4);
        const pqNumber = await generatePqNumber({
            countryCode,
            companyInitials: initials,
            rfqNumber: rfq.rfqNumber,
            style: 'long',
        });

        const totals = computeTotals(
            dto.lines || [],
            dto.rates || {},
            {
                vatEnabled: dto.vatEnabled,
                discountEnabled: dto.discountEnabled,
            }
        );

        const doc = new Quotation({
            pqNumber,
            status: 'draft',
            stage: dto.stage || 'Negotiation',
            rfqId: rfq._id,
            rfqNumber: rfq.rfqNumber,
            client: dto.client || {
                company: rfq.company,
                contactName: rfq.contactName,
                email: rfq.email,
                phone: rfq.phone,
                address: rfq.address,
                city: rfq.city,
                country: rfq.country,
                zipCode: rfq.zipCode,
                designation: rfq.designation,
            },
            clientType: dto.clientType || 'new',
            territory: dto.territory || rfq.country,
            crmManager: dto.crmManager || rfq.assignedTo || rfq.salesman || '',
            currency: dto.currency || 'BDT (base)',
            currencySymbol: dto.currencySymbol || '৳',
            exchangeRate: dto.exchangeRate ?? 1,
            vatEnabled: dto.vatEnabled ?? true,
            discountEnabled: dto.discountEnabled ?? true,
            pqrNumber: dto.pqrNumber || 'ME0-P021(T10)-W(L1)',
            lines: dto.lines || [],
            rates: dto.rates || {},
            logistics: dto.logistics || {},
            terms: dto.terms || [],
            totals,
            createdBy: userId,
        });

        doc.markModified('lines');

        await doc.save();
        return toClientShape(doc);
    },

    // ---------- LIST ----------
    async list(q) {
        const page = Number(q.page) || 1;
        const limit = Math.min(Number(q.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const filter = {};
        if (q.status) filter.status = q.status;
        if (q.rfqId) filter.rfqId = q.rfqId;
        if (q.rfqNumber) filter.rfqNumber = q.rfqNumber;
        if (q.search) {
            const re = new RegExp(q.search, 'i');
            filter.$or = [{ pqNumber: re }, { 'client.company': re }, { rfqNumber: re }];
        }

        const sort = { createdAt: -1 };

        const [items, total] = await Promise.all([
            Quotation.find(filter).sort(sort).skip(skip).limit(limit),
            Quotation.countDocuments(filter),
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
        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');
        return toClientShape(doc);
    },

    // ---------- GET BY RFQ ----------
    async getByRfqId(rfqId) {
        const doc = await Quotation.findOne({ rfqId }).sort({ createdAt: -1 });
        return doc ? toClientShape(doc) : null;
    },

    // ---------- UPDATE (draft save) ----------
    async update(id, dto, userId) {
        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');

        if (doc.status !== 'draft' && doc.status !== 'awaiting_approval') {
            throw ApiError.badRequest('Only drafts can be edited');
        }

        if (dto.client) doc.client = { ...doc.client, ...dto.client };
        if (dto.clientType) doc.clientType = dto.clientType;
        if (dto.territory) doc.territory = dto.territory;
        if (dto.crmManager) doc.crmManager = dto.crmManager;
        if (dto.currency) doc.currency = dto.currency;
        if (dto.currencySymbol) doc.currencySymbol = dto.currencySymbol;
        if (dto.exchangeRate !== undefined) doc.exchangeRate = dto.exchangeRate;
        if (dto.vatEnabled !== undefined) doc.vatEnabled = dto.vatEnabled;
        if (dto.discountEnabled !== undefined) doc.discountEnabled = dto.discountEnabled;
        if (dto.pqrNumber) doc.pqrNumber = dto.pqrNumber;

        if (dto.lines) {
            doc.lines = dto.lines;
            doc.markModified('lines');
        }

        if (dto.rates) doc.rates = dto.rates;
        if (dto.logistics) doc.logistics = dto.logistics;
        if (dto.terms) doc.terms = dto.terms;
        if (dto.stage) doc.stage = dto.stage;

        doc.totals = computeTotals(doc.lines, doc.rates, {
            vatEnabled: doc.vatEnabled,
            discountEnabled: doc.discountEnabled,
        });
        doc.updatedBy = userId;

        await doc.save();
        return toClientShape(doc);
    },

    // ---------- SEND QUOTATION ----------
    async send(id, dto = {}, userId, userName) {
        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');

        if (doc.status === 'sent') {
            throw ApiError.badRequest('Quotation has already been sent');
        }
        if (doc.status === 'won' || doc.status === 'lost') {
            throw ApiError.badRequest(`Quotation is already ${doc.status}`);
        }

        // ⭐ Ensure crmManager is set — fall back to logged-in user
        if (!doc.crmManager && userName) {
            doc.crmManager = userName;
        }

        doc.totals = computeTotals(doc.lines, doc.rates, {
            vatEnabled: doc.vatEnabled,
            discountEnabled: doc.discountEnabled,
        });

        const clientShape = toClientShape(doc);

        // ---- PDF attachment ----
        let attachments = [];
        if (dto.withAttachment) {
            try {
                const { generateQuotationPdf } = require('../../utils/quotationPdf');
                const pdfBuffer = await generateQuotationPdf(clientShape);
                attachments = [
                    {
                        filename: `Quotation-${doc.pqNumber}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf',
                    },
                ];
                console.log(`📎 PDF generated (${(pdfBuffer.length / 1024).toFixed(1)} KB) for ${doc.pqNumber}`);
            } catch (e) {
                console.error('[quotation.send] PDF generation failed:', e.message);
            }
        }

        // ---- Email to client ----
        if (doc.client?.email) {
            try {
                const { sendMail } = require('../../utils/sendEmail');
                const { quotationSentTemplate } = require('./quotation.email.templates');

                await sendMail({
                    to: doc.client.email,
                    subject: `Quotation ${doc.pqNumber} — NGEN IT Limited`,
                    html: quotationSentTemplate({
                        quotation: clientShape,
                        hasAttachment: attachments.length > 0,
                    }),
                    attachments,
                });
                console.log(`📧 Quotation email sent to client: ${doc.client.email}`);
            } catch (e) {
                console.error('[quotation.send] client email failed:', e.message);
            }
        }

        // ---- Email to admin ----
        const adminEmail = process.env.QUOTATION_ADMIN_EMAIL || 'crm.me@ngenitltd.com';
        try {
            const { sendMail } = require('../../utils/sendEmail');
            const { quotationAdminTemplate } = require('./quotation.email.templates');

            await sendMail({
                to: adminEmail,
                subject: `[Internal] Quotation ${doc.pqNumber} sent to ${doc.client?.company || 'client'}`,
                html: quotationAdminTemplate({
                    quotation: clientShape,
                    sentTo: doc.client?.email,
                    sentBy: userName || 'CRM',
                }),
                attachments,
            });
            console.log(`📧 Admin notification sent to: ${adminEmail}`);
        } catch (e) {
            console.error('[quotation.send] admin email failed:', e.message);
        }

        // ---- Update status ----
        doc.status = 'sent';
        doc.sentAt = new Date();
        doc.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        doc.updatedBy = userId;

        doc.markModified('lines');

        await doc.save();

        await syncRfqStage(doc.rfqId, 'quoted', userId);

        // ⭐ AUTO-PUSH TO SALES CRM FORECAST — now passes userName
        pushToForecastSafely(doc, userId, userName);

        return toClientShape(doc);
    },

    // ---------- APPROVE ----------
    async approve(id, userId, userName) {
        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');

        if (!doc.crmManager && userName) {
            doc.crmManager = userName;
        }

        doc.status = 'sent';
        doc.approvedAt = new Date();
        doc.approvedBy = userId;
        doc.sentAt = new Date();
        doc.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        doc.updatedBy = userId;

        await doc.save();

        await syncRfqStage(doc.rfqId, 'quoted', userId);

        // ⭐ AUTO-PUSH TO SALES CRM FORECAST — now passes userName
        pushToForecastSafely(doc, userId, userName || 'Manager');

        return toClientShape(doc);
    },

    // ---------- MARK WON / LOST ----------
    async markOutcome(id, outcome, userId) {
        if (!['won', 'lost'].includes(outcome)) {
            throw ApiError.badRequest('Outcome must be "won" or "lost"');
        }

        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');

        doc.status = outcome;
        doc.closedAt = new Date();
        doc.updatedBy = userId;
        await doc.save();

        if (outcome === 'lost') {
            await syncRfqStage(doc.rfqId, 'lost', userId);
        }

        return toClientShape(doc);
    },

    // ---------- DELETE ----------
    async remove(id) {
        const doc = await Quotation.findByIdAndDelete(id);
        if (!doc) throw ApiError.notFound('Quotation not found');
        return { id };
    },

    // ---------- STATS ----------
    async stats() {
        const [drafts, sent, won, lost, awaiting] = await Promise.all([
            Quotation.countDocuments({ status: 'draft' }),
            Quotation.countDocuments({ status: 'sent' }),
            Quotation.countDocuments({ status: 'won' }),
            Quotation.countDocuments({ status: 'lost' }),
            Quotation.countDocuments({ status: 'awaiting_approval' }),
        ]);

        return { drafts, sent, won, lost, awaiting };
    },
};

module.exports = { QuotationService, computeTotals, toClientShape };