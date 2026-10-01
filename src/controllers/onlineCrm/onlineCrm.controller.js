// src/controllers/onlineCrm/onlineCrm.controller.js
const { OnlineCrmService } = require('../../services/onlineCrm/onlineCrm.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const OnlineCrmController = {
  // ============================================================
  // EXISTING — OnlineQuery CRUD (unchanged)
  // ============================================================

  async listQueries(req, res, next) {
    try {
      const result = await OnlineCrmService.listQueries(req.query);
      res.json(
        ApiResponse.ok(result.items, 'Online queries fetched', {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        })
      );
    } catch (err) { next(err); }
  },

  async getById(req, res, next) {
    try {
      const data = await OnlineCrmService.getById(req.params.id);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async createQuery(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await OnlineCrmService.createQuery(req.body, userId);
      res.status(201).json(ApiResponse.created(data, 'Online query logged'));
    } catch (err) { next(err); }
  },

  async updateQuery(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await OnlineCrmService.updateQuery(
        req.params.id,
        req.body,
        userId
      );
      res.json(ApiResponse.ok(data, 'Online query updated'));
    } catch (err) { next(err); }
  },

  async removeQuery(req, res, next) {
    try {
      const data = await OnlineCrmService.removeQuery(req.params.id);
      res.json(ApiResponse.ok(data, 'Online query deleted'));
    } catch (err) { next(err); }
  },

  async bulkRemove(req, res, next) {
    try {
      const ids = req.body?.ids || [];
      const data = await OnlineCrmService.bulkRemove(ids);
      res.json(
        ApiResponse.ok(
          data,
          `${data.deletedCount} quer${data.deletedCount === 1 ? 'y' : 'ies'} deleted`
        )
      );
    } catch (err) { next(err); }
  },

  async stats(req, res, next) {
    try {
      const data = await OnlineCrmService.stats(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async monthlyVolume(req, res, next) {
    try {
      const data = await OnlineCrmService.monthlyVolume(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async byCountry(req, res, next) {
    try {
      const data = await OnlineCrmService.byCountry(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async topProducts(req, res, next) {
    try {
      const data = await OnlineCrmService.topProducts(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async countries(req, res, next) {
    try {
      const data = await OnlineCrmService.countries();
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ============================================================
  // ⭐ UNIFIED — Merge RFQ + Tender + Quotation + OnlineQuery
  // ============================================================

  async unifiedList(req, res, next) {
    try {
      const result = await OnlineCrmService.unifiedList(req.query);
      res.json(
        ApiResponse.ok(result.items, 'Unified queries fetched', {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        })
      );
    } catch (err) { next(err); }
  },

  async unifiedStats(req, res, next) {
    try {
      const data = await OnlineCrmService.unifiedStats(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async unifiedMonthly(req, res, next) {
    try {
      const data = await OnlineCrmService.unifiedMonthlyVolume(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async unifiedByCountry(req, res, next) {
    try {
      const data = await OnlineCrmService.unifiedByCountry(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async unifiedTop(req, res, next) {
    try {
      const data = await OnlineCrmService.unifiedTopProducts(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },
};

module.exports = { OnlineCrmController };