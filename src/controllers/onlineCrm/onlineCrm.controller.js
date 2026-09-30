// src/controllers/onlineCrm/onlineCrm.controller.js
const { OnlineCrmService } = require('../../services/onlineCrm/onlineCrm.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const OnlineCrmController = {
  // ============================================================
  // LIST
  // GET /api/v1/online-crm/queries
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
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // GET BY ID
  // GET /api/v1/online-crm/queries/:id
  // ============================================================
  async getById(req, res, next) {
    try {
      const data = await OnlineCrmService.getById(req.params.id);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // CREATE
  // POST /api/v1/online-crm/queries
  // ============================================================
  async createQuery(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await OnlineCrmService.createQuery(req.body, userId);
      res.status(201).json(ApiResponse.created(data, 'Online query logged'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // UPDATE
  // PATCH /api/v1/online-crm/queries/:id
  // ============================================================
  async updateQuery(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await OnlineCrmService.updateQuery(
        req.params.id,
        req.body,
        userId
      );
      res.json(ApiResponse.ok(data, 'Online query updated'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // DELETE — single
  // DELETE /api/v1/online-crm/queries/:id
  // ============================================================
  async removeQuery(req, res, next) {
    try {
      const data = await OnlineCrmService.removeQuery(req.params.id);
      res.json(ApiResponse.ok(data, 'Online query deleted'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // DELETE — bulk
  // POST /api/v1/online-crm/queries/bulk-delete
  // ============================================================
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
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // KPI STATS
  // GET /api/v1/online-crm/stats
  // ============================================================
  async stats(req, res, next) {
    try {
      const data = await OnlineCrmService.stats(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // MONTHLY VOLUME
  // GET /api/v1/online-crm/monthly-volume
  // ============================================================
  async monthlyVolume(req, res, next) {
    try {
      const data = await OnlineCrmService.monthlyVolume(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // BY COUNTRY
  // GET /api/v1/online-crm/by-country
  // ============================================================
  async byCountry(req, res, next) {
    try {
      const data = await OnlineCrmService.byCountry(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // TOP PRODUCTS + CLIENTS
  // GET /api/v1/online-crm/top-products
  // ============================================================
  async topProducts(req, res, next) {
    try {
      const data = await OnlineCrmService.topProducts(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // DISTINCT COUNTRIES
  // GET /api/v1/online-crm/countries
  // ============================================================
  async countries(req, res, next) {
    try {
      const data = await OnlineCrmService.countries();
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { OnlineCrmController };