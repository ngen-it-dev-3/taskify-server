// src/services/salesOrder/salesOrder.service.js
const SalesOrder = require('../../models/salesOrder/SalesOrder.model');
const Client = require('../../models/Client.model');
const { ApiError } = require('../../utils/rfq/ApiError');

const {
  STAGES,
  SOURCES,
  ORDER_TYPES,
} = require('../../models/salesOrder/SalesOrder.model');

// ============================================================
// HELPERS
// ============================================================

function fmtOrder(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    poRef: d.poRef,
    orderType: d.orderType,
    source: d.source,
    quotationId: d.quotationId?.toString() || null,
    tenderId: d.tenderId?.toString() || null,
    rfqId: d.rfqId?.toString() || null,
    forecastEntryId: d.forecastEntryId?.toString() || null,
    client360Id: d.client360Id?.toString() || null,
    client: d.client,
    product: d.product,
    productSpec: d.productSpec,
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    salesValue: d.salesValue,
    salesman: d.salesman,
    crmManager: d.crmManager,
    stage: d.stage,
    stages: d.stages || {},
    principal: d.principal,
    procurementStatus: d.procurementStatus,
    procurementFileSentAt: d.procurementFileSentAt,
    procurementRecipients: d.procurementRecipients || [],
    logisticsMode: d.logisticsMode,
    customs: d.customs,
    logisticsChecklist: d.logisticsChecklist || {},
    clientPayment: d.clientPayment || {},
    principalPayment: d.principalPayment || {},
    orderedAt: d.orderedAt,
    deliveredAt: d.deliveredAt,
    invoicedAt: d.invoicedAt,
    paidAt: d.paidAt,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function detectOrderType(productName) {
  const p = String(productName || '').toLowerCase();
  if (p.includes('software') || p.includes('license') || p.includes('adobe') || p.includes('eviews'))
    return 'SW';
  if (p.includes('marketing') || p.includes('campaign')) return 'M';
  if (p.includes('service') || p.includes('maintenance') || p.includes('support')) return 'SVC';
  return 'HW';
}

/**
 * Generate a PO REF: NG-{CLIENT_INITIALS}/{TYPE}/{YYMMDD}/{SEQ}
 */
async function generatePoRef(company, orderType) {
  const initials = String(company || 'UNK')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 6)
    .toUpperCase() || 'UNK';

  const now = new Date();
  const dateStr =
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const prefix = `NG-${initials}/${orderType}/${dateStr}`;

  const last = await SalesOrder.findOne({ poRef: { $regex: `^${prefix}` } })
    .sort({ poRef: -1 })
    .lean();

  let seq = 1;
  if (last?.poRef) {
    const parts = last.poRef.split('/');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}/${String(seq).padStart(3, '0')}`;
}

function buildFilter(q = {}) {
  const filter = {};

  if (q.stage && q.stage !== 'all') filter.stage = q.stage;
  if (q.source && q.source !== 'all') filter.source = q.source;
  if (q.orderType && q.orderType !== 'all') filter.orderType = q.orderType;
  if (q.salesman && q.salesman !== 'all') filter.salesman = q.salesman;

  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [
      { poRef: re },
      { 'client.company': re },
      { product: re },
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
const SalesOrderService = {
  // ============================================================
  // ⭐ CORE — CREATE ORDER FROM A WON DEAL (any source)
  // ============================================================
  async createFromWon({ source, quotation, tender, forecastEntry, userId }) {
    // ---- 1. Figure out the deal identity for dedup ----
    const rfqId =
      quotation?.rfqId ||
      tender?.rfqId ||
      forecastEntry?.rfqId ||
      null;

    const quotationId = quotation?._id || null;
    const tenderId = tender?._id || null;
    const forecastId = forecastEntry?._id || null;

    // ---- 2. Check for existing order ----
    const orQuery = [];
    if (quotationId) orQuery.push({ quotationId });
    if (tenderId) orQuery.push({ tenderId });
    if (forecastId) orQuery.push({ forecastEntryId: forecastId });
    if (rfqId) orQuery.push({ rfqId });

    if (orQuery.length === 0) {
      throw ApiError.badRequest('No valid source provided');
    }

    const existing = await SalesOrder.findOne({ $or: orQuery }).lean();
    if (existing) {
      // Just link additional sources if not present
      const patch = {};
      if (quotationId && !existing.quotationId) patch.quotationId = quotationId;
      if (tenderId && !existing.tenderId) patch.tenderId = tenderId;
      if (forecastId && !existing.forecastEntryId) patch.forecastEntryId = forecastId;

      if (Object.keys(patch).length > 0) {
        await SalesOrder.updateOne({ _id: existing._id }, { $set: patch });
      }
      console.log(`📦 Sales Order ${existing.poRef} already exists — linked new source`);
      return await SalesOrder.findById(existing._id);
    }

    // ---- 3. Extract data from the winning source ----
    let company = '';
    let contactName = '';
    let email = '';
    let phone = '';
    let country = '';
    let address = '';
    let product = '';
    let productSpec = '';
    let salesValue = 0;
    let salesman = '';
    let crmManager = '';
    let principal = '';
    let quantity = 1;
    let unitPrice = 0;

    if (quotation) {
      company = quotation.client?.company || '';
      contactName = quotation.client?.contactName || '';
      email = quotation.client?.email || '';
      phone = quotation.client?.phone || '';
      country = quotation.client?.country || quotation.territory || '';
      address = quotation.client?.address || '';
      const firstLine = quotation.lines?.[0];
      product = firstLine?.name || `${quotation.lines?.length || 0} item(s)`;
      productSpec = firstLine?.spec || '';
      quantity = Number(firstLine?.qty) || 1;
      unitPrice = Number(firstLine?.principalCost) || 0;
      salesValue = quotation.totals?.grandTotal || 0;
      salesman = quotation.crmManager || '';
      crmManager = quotation.crmManager || '';
    } else if (tender) {
      company = tender.tenderer || '';
      country = tender.country || 'Bangladesh';
      product = tender.title || '';
      productSpec = tender.description || '';
      salesValue = Number(tender.bidValue || tender.tentativeBudget || 0);
      salesman = tender.responsiblePerson || tender.recordedBy || '';
      crmManager = tender.responsiblePerson || '';
    } else if (forecastEntry) {
      company = forecastEntry.client || '';
      country = forecastEntry.country || 'Bangladesh';
      product = forecastEntry.item || '';
      salesValue = Number(forecastEntry.value) || 0;
      salesman = forecastEntry.owner || '';
      crmManager = forecastEntry.owner || '';
    }

    // ---- 4. Generate PO REF ----
    const orderType = detectOrderType(product);
    const poRef = await generatePoRef(company, orderType);

    // ---- 5. Find/create Client 360 ----
    let clientDoc = null;
    if (company) {
      const nameKey = String(company).trim().toLowerCase();
      clientDoc = await Client.findOne({ nameKey }).lean();
      if (!clientDoc) {
        clientDoc = await Client.create({
          name: company,
          nameKey,
          tier: '',
          sector: '',
          country: country || 'Bangladesh',
          autoAdded: true,
          autoAddedFrom: source,
          sourceRefs: {
            tenderId: tenderId || null,
            rfqId: rfqId || null,
            quotationIds: quotationId ? [quotationId] : [],
            forecastEntryIds: forecastId ? [forecastId] : [],
          },
        });
      }
    }

    // ---- 6. Create the order ----
    const now = new Date();
    const order = new SalesOrder({
      poRef,
      orderType,
      source,
      quotationId,
      tenderId,
      rfqId,
      forecastEntryId: forecastId,
      client360Id: clientDoc?._id || null,
      client: { company, contactName, email, phone, country, address },
      product,
      productSpec,
      quantity,
      unitPrice,
      salesValue,
      salesman,
      crmManager,
      stage: 'Order Placed',
      stages: {
        orderPlaced: { at: now, by: userId, note: 'Auto-created from won deal' },
      },
      principal: '',
      procurementStatus: 'Not Sent',
      logisticsMode: '',
      customs: 'Not Started',
      clientPayment: { status: 'Not Invoiced' },
      principalPayment: { status: 'Not Required' },
      orderedAt: now,
      createdBy: userId,
      updatedBy: userId,
    });

    await order.save();
    console.log(`📦 Sales Order created: ${poRef} — ${company} (৳${salesValue.toLocaleString()})`);

    // ---- 7. Update Client 360 stats ----
    if (clientDoc) {
      await Client.updateOne(
        { _id: clientDoc._id },
        {
          $inc: { ordersFY26: 1, lifetimeValue: salesValue },
          $max: { lastOrderAt: now },
        }
      );
    }

    return order;
  },

  // ============================================================
  // LIST
  // ============================================================
  async listOrders(q = {}) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Number(q.limit) || 50, 500);
    const skip = (page - 1) * limit;

    const filter = buildFilter(q);
    const sort = { createdAt: -1 };

    const [items, total] = await Promise.all([
      SalesOrder.find(filter).sort(sort).skip(skip).limit(limit),
      SalesOrder.countDocuments(filter),
    ]);

    return {
      items: items.map(fmtOrder),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // ============================================================
  // GET BY ID
  // ============================================================
  async getOrderById(id) {
    const doc = await SalesOrder.findById(id);
    if (!doc) throw ApiError.notFound('Sales order not found');
    return fmtOrder(doc);
  },

  // ============================================================
  // MANUAL CREATE (from "+ Add Order" button)
  // ============================================================
  async createManual(dto, userId) {
    if (!dto.client?.company) {
      throw ApiError.badRequest('Client company is required');
    }

    const orderType = detectOrderType(dto.product);
    const poRef = dto.poRef || (await generatePoRef(dto.client.company, orderType));

    const order = new SalesOrder({
      poRef,
      orderType,
      source: 'manual',
      client: dto.client,
      product: dto.product || '',
      productSpec: dto.productSpec || '',
      quantity: Number(dto.quantity) || 1,
      unitPrice: Number(dto.unitPrice) || 0,
      salesValue: Number(dto.salesValue) || 0,
      salesman: dto.salesman || '',
      crmManager: dto.crmManager || '',
      stage: dto.stage || 'Order Placed',
      stages: {
        orderPlaced: { at: new Date(), by: userId, note: 'Manual entry' },
      },
      notes: dto.notes || '',
      orderedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    });

    await order.save();
    return fmtOrder(order);
  },

  // ============================================================
  // UPDATE
  // ============================================================
  async updateOrder(id, dto, userId) {
    const doc = await SalesOrder.findById(id);
    if (!doc) throw ApiError.notFound('Sales order not found');

    const patchable = [
      'client', 'product', 'productSpec', 'quantity', 'unitPrice',
      'salesValue', 'salesman', 'crmManager', 'principal',
      'procurementStatus', 'procurementRecipients', 'logisticsMode',
      'customs', 'logisticsChecklist', 'clientPayment', 'principalPayment',
      'notes', 'orderType','expectedDeliveryDate',
    ];

    for (const k of patchable) {
      if (dto[k] !== undefined) doc[k] = dto[k];
    }

    // ⭐ If stage changed, stamp the stage history
    if (dto.stage && dto.stage !== doc.stage) {
      doc.stage = dto.stage;
      const stageKey = stageToKey(dto.stage);
      if (stageKey && doc.stages[stageKey]) {
        doc.stages[stageKey] = {
          at: new Date(),
          by: userId,
          note: dto.stageNote || '',
        };
      }
      if (dto.stage === 'Delivery') doc.deliveredAt = new Date();
      if (dto.stage === 'Invoiced') doc.invoicedAt = new Date();
      if (dto.stage === 'Payment Received') doc.paidAt = new Date();
    }

    doc.updatedBy = userId;
    await doc.save();
    return fmtOrder(doc);
  },

  // ============================================================
  // ADVANCE STAGE (single-click)
  // ============================================================
  async advanceStage(id, newStage, userId, note = '') {
    return this.updateOrder(id, { stage: newStage, stageNote: note }, userId);
  },

  // ============================================================
  // DELETE
  // ============================================================
  async deleteOrder(id) {
    const doc = await SalesOrder.findByIdAndDelete(id);
    if (!doc) throw ApiError.notFound('Sales order not found');
    return { id };
  },

  // ============================================================
  // STATS — for KPI cards
  // ============================================================
  async getStats(q = {}) {
    const filter = buildFilter({ ...q, stage: 'all' });

    const [total, inProgress, delivered, paymentPendingAgg] = await Promise.all([
      SalesOrder.countDocuments(filter),
      SalesOrder.countDocuments({
        ...filter,
        stage: { $in: ['Order Placed', 'Sourcing', 'Procurement'] },
      }),
      SalesOrder.countDocuments({
        ...filter,
        stage: { $in: ['Delivery', 'Invoiced'] },
      }),
      SalesOrder.aggregate([
        {
          $match: {
            ...filter,
            'clientPayment.status': { $ne: 'Received' },
          },
        },
        { $group: { _id: null, total: { $sum: '$salesValue' } } },
      ]),
    ]);

    const paymentPending = paymentPendingAgg[0]?.total || 0;

    return {
      totalOrders: total,
      inProgress,
      delivered,
      paymentPending,
    };
  },

  // ============================================================
  // CONSTANTS
  // ============================================================
  getConstants() {
    return { STAGES, SOURCES, ORDER_TYPES };
  },
};

function stageToKey(stage) {
  return {
    'Order Placed': 'orderPlaced',
    Sourcing: 'sourcing',
    Procurement: 'procurement',
    Delivery: 'delivery',
    Invoiced: 'invoiced',
    'Payment Received': 'paymentReceived',
  }[stage] || null;
}

module.exports = { SalesOrderService, fmtOrder, generatePoRef };