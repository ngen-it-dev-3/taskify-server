// src/controllers/rfq/rfq.controller.js

const { RFQService } = require('../../services/rfq/rfq.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const RFQController = {
// ============================================================
// CREATE
// POST /api/v1/crm/rfq
// ============================================================
async create(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const data = await RFQService.create(req.body, userId);
    res
      .status(201)
      .json(ApiResponse.created(data, 'RFQ created successfully'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// LIST
// GET /api/v1/crm/rfq?page=1&limit=20&search=&country=&...
// ============================================================
async list(req, res, next) {
  try {
    const includeArchived =
      req.query.showArchived === true || req.query.showArchived === 'true';

    const result = await RFQService.list(req.query, includeArchived);

    res.json(
      ApiResponse.ok(result.items, 'RFQs fetched', {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      })
    );
  } catch (err) {
    next(err);
  }
},

// ============================================================
// GET ONE
// GET /api/v1/crm/rfq/:id
// ============================================================
async getById(req, res, next) {
  try {
    const data = await RFQService.getById(req.params.id);
    res.json(ApiResponse.ok(data));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// ASSIGN
// POST /api/v1/crm/rfq/:id/assign
// Body: { assignedTo, priority?, notes? }
// → fires 2 emails (assignee + client) asynchronously
// ============================================================
async assign(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const assignedBy =
      req.user?.fullName ||
      req.user?.name ||
      req.user?.email ||
      'CRM Admin';

    const data = await RFQService.assign(
      req.params.id,
      { ...req.body, assignedBy },
      userId
    );

    res.json(ApiResponse.ok(data, 'RFQ assigned successfully'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// UPDATE
// PATCH /api/v1/crm/rfq/:id
// Body: { stage?, priority?, assignedTo?, salesman?, comment?, products? }
// ============================================================
async update(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const data = await RFQService.update(req.params.id, req.body, userId);
    res.json(ApiResponse.ok(data, 'RFQ updated successfully'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// ARCHIVE
// POST /api/v1/crm/rfq/:id/archive
// ============================================================
async archive(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const data = await RFQService.archive(req.params.id, userId);
    res.json(ApiResponse.ok(data, 'RFQ archived'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// UNARCHIVE
// POST /api/v1/crm/rfq/:id/unarchive
// ============================================================
async unarchive(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    const data = await RFQService.unarchive(req.params.id, userId);
    res.json(ApiResponse.ok(data, 'RFQ restored'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// DELETE
// DELETE /api/v1/crm/rfq/:id
// ============================================================
async remove(req, res, next) {
  try {
    const data = await RFQService.remove(req.params.id);
    res.json(ApiResponse.ok(data, 'RFQ deleted'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// STATS
// GET /api/v1/crm/rfq/stats
// ============================================================
async stats(req, res, next) {
  try {
    const data = await RFQService.stats();
    res.json(ApiResponse.ok(data));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// SYNC FROM WEB PORTAL
// POST /api/v1/crm/rfq/sync
// ============================================================
async sync(req, res, next) {
  try {
    const data = await RFQService.syncFromWebPortal();
    res.json(ApiResponse.ok(data, 'Sync completed'));
  } catch (err) {
    next(err);
  }
},

// ============================================================
// FILE UPLOAD
// POST /api/v1/crm/rfq/upload
// multipart/form-data: files[]
// ============================================================
async uploadFiles(req, res, next) {
  try {
    const files = (req.files || []).map(
      (f) => `/uploads/rfq-products/${f.filename}`
    );
    res.json(ApiResponse.ok({ files }, 'Files uploaded'));
  } catch (err) {
    next(err);
  }
},
};

module.exports = { RFQController };