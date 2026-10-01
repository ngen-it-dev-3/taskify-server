// src/controllers/client360/client360.controller.js
const { Client360Service } = require('../../services/client360/client360.service');
const { ApiResponse } = require('../../utils/rfq/ApiResponse');

const Client360Controller = {
    // ============================================================
    // LIST
    // GET /api/v1/clients
    // ============================================================
    async listClients(req, res, next) {
        try {
            const result = await Client360Service.listClients(req.query);
            res.json(
                ApiResponse.ok(result.items, 'Clients fetched', {
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    totalPages: result.totalPages,
                })
            );
        } catch (err) { next(err); }
    },

    // ============================================================
    // GET ONE
    // GET /api/v1/clients/:id
    // ============================================================
    async getById(req, res, next) {
        try {
            const data = await Client360Service.getById(req.params.id);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },

    // ============================================================
    // STATS — "All Clients" KPI cards
    // GET /api/v1/clients/stats
    // ============================================================
    async getStats(req, res, next) {
        try {
            const data = await Client360Service.getStats(req.query);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },

    // ============================================================
    // SECTOR BREAKDOWN — sector tabs
    // GET /api/v1/clients/sector-breakdown
    // ============================================================
    async getSectorBreakdown(req, res, next) {
        try {
            const data = await Client360Service.getSectorBreakdown(req.query);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },

    // ============================================================
    // CREATE (manual)
    // POST /api/v1/clients
    // ============================================================
    async createManual(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.createManual(req.body, userId);
            res.status(201).json(ApiResponse.created(data, 'Client created'));
        } catch (err) { next(err); }
    },

    // ============================================================
    // UPDATE
    // PATCH /api/v1/clients/:id
    // ============================================================
    async updateClient(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.updateClient(req.params.id, req.body, userId);
            res.json(ApiResponse.ok(data, 'Client updated'));
        } catch (err) { next(err); }
    },

    // ============================================================
    // DELETE
    // DELETE /api/v1/clients/:id
    // ============================================================
    async deleteClient(req, res, next) {
        try {
            const data = await Client360Service.deleteClient(req.params.id);
            res.json(ApiResponse.ok(data, 'Client deleted'));
        } catch (err) { next(err); }
    },

    // ============================================================
    // CONTACTS
    // ============================================================
    async addContact(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.addContact(req.params.id, req.body, userId);
            res.status(201).json(ApiResponse.created(data, 'Contact added'));
        } catch (err) { next(err); }
    },

    async updateContact(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.updateContact(
                req.params.id,
                req.params.contactId,
                req.body,
                userId
            );
            res.json(ApiResponse.ok(data, 'Contact updated'));
        } catch (err) { next(err); }
    },

    async deleteContact(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.deleteContact(
                req.params.id,
                req.params.contactId,
                userId
            );
            res.json(ApiResponse.ok(data, 'Contact deleted'));
        } catch (err) { next(err); }
    },

    // ============================================================
    // COMMUNICATION LOG
    // ============================================================
    async addCommunication(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;
            const data = await Client360Service.addCommunication(
                req.params.id,
                req.body,
                userId
            );
            res.status(201).json(ApiResponse.created(data, 'Communication logged'));
        } catch (err) { next(err); }
    },

    // ============================================================
    // CONSTANTS
    // GET /api/v1/clients/constants
    // ============================================================
    async getConstants(req, res, next) {
        try {
            const data = Client360Service.getConstants();
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },
    async getClientQuotations(req, res, next) {
        try {
            const data = await Client360Service.getClientQuotations(req.params.id);
            res.json(ApiResponse.ok(data));
        } catch (err) { next(err); }
    },
};


module.exports = { Client360Controller };