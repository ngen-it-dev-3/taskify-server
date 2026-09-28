// src/services/quotation/quotation.service.js
const Quotation = require('../../models/Quotation.model');
const RFQ = require('../../models/rfq/RFQ');
const { ApiError } = require('../../utils/rfq/ApiError');
const { generatePqNumber } = require('../../utils/quotationNumber');
const { sendMail } = require('../../utils/sendEmail');
const {
    quotationSentTemplate,
} = require('./quotation.email.templates');

// ============================================================
// CALCULATE TOTALS
//
// Business rules (mirrors frontend exactly):
//   1. Principal Discount % reduces the COST (supplier-side)
//   2. Office / Profit / Others margins apply to discounted cost
//   3. Per-line Disc % applies to the price (client-side)
//      — gated by meta.discountEnabled
//   4. Tax is applied to the post-discount amount
//      — gated by meta.vatEnabled
// ============================================================
function computeTotals(lines, rates, meta = {}) {
    let costOfGoods = 0;
    let officeExpenses = 0;
    let commissionOthers = 0;
    let netProfit = 0;

    let subTotal = 0;          // pre-discount, pre-tax
    let discountTotal = 0;     // Σ per-line client discounts
    let customerPrice = 0;     // post-discount, pre-tax
    let totalWeight = 0;

    // ⭐ Principal discount reduces cost basis
    const principalRate = 1 - (rates.principalDiscountPct || 0) / 100;

    // ⭐ Respect the Special Discount checkbox (default: ON)
    const discountEnabled = meta.discountEnabled !== false;

    // ⭐ Respect the VAT / GST checkbox (default: ON)
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

        // ⭐ Per-line discount only when enabled
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

    // ⭐ Tax on post-discount subtotal — only when enabled
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

        // ⭐ Pass checkbox flags into computeTotals
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

        // ⭐ Force Mongoose to persist nested source fields on first save
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
            // ⭐ Force Mongoose to see the nested change (source1/2/3)
            doc.markModified('lines');
        }

        if (dto.rates) doc.rates = dto.rates;
        if (dto.logistics) doc.logistics = dto.logistics;
        if (dto.terms) doc.terms = dto.terms;
        if (dto.stage) doc.stage = dto.stage;

        // ⭐ Recompute totals using the persisted checkbox state
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

        // ⭐ Recompute totals just before sending to reflect latest state
        doc.totals = computeTotals(doc.lines, doc.rates, {
            vatEnabled: doc.vatEnabled,
            discountEnabled: doc.discountEnabled,
        });

        const clientShape = toClientShape(doc);

        // ---- Build optional PDF attachment ----
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

        // ---- Send email to CLIENT ----
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

        // ---- Send email to ADMIN / CRM Team ----
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

        // ---- Update quotation status ----
        doc.status = 'sent';
        doc.sentAt = new Date();
        doc.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        doc.updatedBy = userId;

        // ⭐ Force Mongoose to see nested changes if any sources were added since last save
        doc.markModified('lines');

        await doc.save();

        // ⭐ CASCADE: mark parent RFQ as 'quoted'
        await syncRfqStage(doc.rfqId, 'quoted', userId);

        return toClientShape(doc);
    },

    // ---------- APPROVE (manager action) ----------
    async approve(id, userId) {
        const doc = await Quotation.findById(id);
        if (!doc) throw ApiError.notFound('Quotation not found');

        doc.status = 'sent';
        doc.approvedAt = new Date();
        doc.approvedBy = userId;
        doc.sentAt = new Date();
        doc.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        doc.updatedBy = userId;

        await doc.save();

        // ⭐ CASCADE
        await syncRfqStage(doc.rfqId, 'quoted', userId);

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