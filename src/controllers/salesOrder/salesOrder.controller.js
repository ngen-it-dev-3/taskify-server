// src/controllers/salesOrder/salesOrder.controller.js
const { SalesOrderService } = require('../../services/salesOrder/salesOrder.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const SalesOrderController = {
  async listOrders(req, res, next) {
    try {
      const result = await SalesOrderService.listOrders(req.query);
      res.json(
        ApiResponse.ok(result.items, 'Orders fetched', {
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
      const data = await SalesOrderService.getOrderById(req.params.id);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async createManual(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await SalesOrderService.createManual(req.body, userId);
      res.status(201).json(ApiResponse.created(data, 'Order created'));
    } catch (err) { next(err); }
  },

  async updateOrder(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const data = await SalesOrderService.updateOrder(req.params.id, req.body, userId);
      res.json(ApiResponse.ok(data, 'Order updated'));
    } catch (err) { next(err); }
  },

  async advanceStage(req, res, next) {
    try {
      const userId = req.user?._id || req.user?.id;
      const { stage, note } = req.body;
      const data = await SalesOrderService.advanceStage(req.params.id, stage, userId, note);
      res.json(ApiResponse.ok(data, `Moved to ${stage}`));
    } catch (err) { next(err); }
  },

  async deleteOrder(req, res, next) {
    try {
      const data = await SalesOrderService.deleteOrder(req.params.id);
      res.json(ApiResponse.ok(data, 'Order deleted'));
    } catch (err) { next(err); }
  },

  async getStats(req, res, next) {
    try {
      const data = await SalesOrderService.getStats(req.query);
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },

  async getConstants(req, res, next) {
    try {
      const data = SalesOrderService.getConstants();
      res.json(ApiResponse.ok(data));
    } catch (err) { next(err); }
  },
};

module.exports = { SalesOrderController };