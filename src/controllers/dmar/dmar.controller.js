// src/controllers/dmar/dmar.controller.js
const { DmarService } = require('../../services/dmar/dmar.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const DmarController = {
  // ---- List activities ----
  async listActivities(req, res, next) {
    try {
      const result = await DmarService.listActivities(req.query);
      res.json(
        ApiResponse.ok(result.items, 'Activities fetched', {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        })
      );
    } catch (err) { next(err); }
  },

  // ---- Get one ----
  async getById(req, res, next) {
    try {
      const data = await DmarService.getActivityById(req.params.id);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ---- Create ----
  async createActivity(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await DmarService.createActivity(req.body, userId);
      res.status(201).json(ApiResponse.created(data, 'Activity logged'));
    } catch (err) { next(err); }
  },

  // ---- Update ----
  async updateActivity(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await DmarService.updateActivity(req.params.id, req.body, userId);
      res.json(ApiResponse.ok(data, 'Activity updated'));
    } catch (err) { next(err); }
  },

  // ---- Mark sold ----
  async markSold(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await DmarService.markSold(req.params.id, userId);
      res.json(ApiResponse.ok(data, 'Marked as sold'));
    } catch (err) { next(err); }
  },

  // ---- Delete ----
  async removeActivity(req, res, next) {
    try {
      const data = await DmarService.removeActivity(req.params.id);
      res.json(ApiResponse.ok(data, 'Activity deleted'));
    } catch (err) { next(err); }
  },

  // ---- Stats ----
  async getStats(req, res, next) {
    try {
      const data = await DmarService.getStats(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ---- Sector-wise visits ----
  async getSectorVisits(req, res, next) {
    try {
      const data = await DmarService.getSectorVisits(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ---- Monthly plan ----
  async getMonthlyPlan(req, res, next) {
    try {
      const data = await DmarService.getMonthlyPlan(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ---- Upsert monthly settings ----
  async upsertSettings(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await DmarService.upsertSettings(req.body, userId);
      res.json(ApiResponse.ok(data, 'Settings saved'));
    } catch (err) { next(err); }
  },

  // ---- Team members ----
  async getTeamMembers(req, res, next) {
    try {
      const data = await DmarService.getTeamMembers();
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  // ---- Constants ----
  async getConstants(req, res, next) {
    try {
      const data = DmarService.getConstants();
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },
};

module.exports = { DmarController };