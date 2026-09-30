// src/controllers/quotation/quotation.controller.js
const { QuotationService } = require('../../services/quotation/quotation.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const QuotationController = {
    async create(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await QuotationService.create(req.body, userId);
            res.status(201).json(ApiResponse.created(data, 'Quotation created'));
        } catch (err) { next(err); }
    },

    async list(req, res, next) {
        try {
            const result = await QuotationService.list(req.query);
            res.json(ApiResponse.ok(result.items, 'Quotations fetched', {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages,
            }));
        } catch (err) { next(err); }
    },

    async getById(req, res, next) {
        try {
            const data = await QuotationService.getById(req.params.id);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },

    async getByRfqId(req, res, next) {
        try {
            const data = await QuotationService.getByRfqId(req.params.rfqId);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },

    async update(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await QuotationService.update(req.params.id, req.body, userId);
            res.json(ApiResponse.ok(data, 'Quotation updated'));
        } catch (err) { next(err); }
    },

    // ⭐ FIXED: pass userId + userName consistently
    async send(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const userName =
                req.user?.fullName ||
                req.user?.name ||
                req.user?.email ||
                'CRM Admin';

            const data = await QuotationService.send(
                req.params.id,
                { withAttachment: req.body?.withAttachment === true },
                userId,
                userName
            );

            res.json(ApiResponse.ok(data, 'Quotation sent'));
        } catch (err) {
            next(err);
        }
    },

    // ⭐ FIXED: pass userName so crmManager fallback works
    async approve(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const userName =
                req.user?.fullName ||
                req.user?.name ||
                req.user?.email ||
                'Manager';

            const data = await QuotationService.approve(
                req.params.id,
                userId,
                userName
            );

            res.json(ApiResponse.ok(data, 'Quotation approved'));
        } catch (err) { next(err); }
    },

    async markOutcome(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await QuotationService.markOutcome(req.params.id, req.body.outcome, userId);
            res.json(ApiResponse.ok(data, `Marked ${req.body.outcome}`));
        } catch (err) { next(err); }
    },

    async remove(req, res, next) {
        try {
            const data = await QuotationService.remove(req.params.id);
            res.json(ApiResponse.ok(data, 'Quotation deleted'));
        } catch (err) { next(err); }
    },

    async stats(req, res, next) {
        try {
            const data = await QuotationService.stats();
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },
};

module.exports = { QuotationController };