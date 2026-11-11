// src/controllers/salesCrm/salesCrm.controller.js
const { SalesCrmService } = require('../../services/salesCrm/salesCrm.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const SalesCrmController = {
  // ============================================================
  // CREATE
  // POST /api/v1/sales-crm/entries
  // ============================================================
  async createEntry(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await SalesCrmService.createEntry(req.body, userId);
      res.status(201).json(ApiResponse.created(data, 'Forecast entry created'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // LIST
  // GET /api/v1/sales-crm/entries
  // ?month=&stage=&source=&owner=&country=&region=&search=
  // &dateFrom=&dateTo=&page=&limit=
  // ============================================================
  async listEntries(req, res, next) {
    try {
      const result = await SalesCrmService.listEntries(req.query);
      res.json(
        ApiResponse.ok(result.items, 'Forecast entries fetched', {
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
  // GET /api/v1/sales-crm/entries/:id
  // ============================================================
  async getById(req, res, next) {
    try {
      const data = await SalesCrmService.getById(req.params.id);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // UPDATE
  // PATCH /api/v1/sales-crm/entries/:id
  // ============================================================
  async updateEntry(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await SalesCrmService.updateEntry(
        req.params.id,
        req.body,
        userId
      );
      res.json(ApiResponse.ok(data, 'Forecast entry updated'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // DELETE — single
  // DELETE /api/v1/sales-crm/entries/:id
  // ============================================================
  async removeEntry(req, res, next) {
    try {
      const data = await SalesCrmService.removeEntry(req.params.id);
      res.json(ApiResponse.ok(data, 'Forecast entry deleted'));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // DELETE — bulk
  // POST /api/v1/sales-crm/entries/bulk-delete
  // Body: { ids: string[] }
  // ============================================================
  async bulkRemove(req, res, next) {
    try {
      const ids = req.body?.ids || req.body?.ids?.split(',') || [];
      const data = await SalesCrmService.bulkRemove(ids);
      res.json(
        ApiResponse.ok(
          data,
          `${data.deletedCount} forecast entr${
            data.deletedCount === 1 ? 'y' : 'ies'
          } deleted`
        )
      );
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // PIPELINE — 6 columns
  // GET /api/v1/sales-crm/pipeline
  // ============================================================
  async getPipeline(req, res, next) {
    try {
      const data = await SalesCrmService.getPipeline(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // FORECAST — KPIs (top 5 cards)
  // GET /api/v1/sales-crm/forecast/kpis
  // ============================================================
  async getForecastKpis(req, res, next) {
    try {
      const data = await SalesCrmService.getForecastKpis(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // FORECAST — Monthly trend bar chart
  // GET /api/v1/sales-crm/forecast/trend
  // ============================================================
  async getForecastTrend(req, res, next) {
    try {
      const data = await SalesCrmService.getForecastTrend(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // FORECAST — Breakdown (by country | stage | source | owner)
  // GET /api/v1/sales-crm/forecast/breakdown?by=country
  // ============================================================
  async getBreakdown(req, res, next) {
    try {
      const by = req.query.by || 'country';
      const data = await SalesCrmService.getBreakdown(req.query, by);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // FORECAST — By salesperson panel
  // GET /api/v1/sales-crm/forecast/by-salesperson
  // ============================================================
  async getBySalesperson(req, res, next) {
    try {
      const data = await SalesCrmService.getBySalesperson(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },

  // ============================================================
  // SALES REPORT — FY26 target vs achieved per month
  // GET /api/v1/sales-crm/sales-report
  // ============================================================
  async getSalesReport(req, res, next) {
    try {
      const data = await SalesCrmService.getSalesReport(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { SalesCrmController };