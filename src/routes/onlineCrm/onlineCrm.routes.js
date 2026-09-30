// src/routes/onlineCrm/onlineCrm.routes.js
const express = require('express');
const router = express.Router();

const {
  OnlineCrmController,
} = require('../../controllers/onlineCrm/onlineCrm.controller');
const { validateBody } = require('../../middleware/rfq/validate');

// ============================================================
// VALIDATION SCHEMAS
// ============================================================
const createQuerySchema = {
  company: { type: 'string', required: true, max: 200 },
  country: { type: 'string', required: true, max: 100 },
};

const updateQuerySchema = {
  // All optional — PATCH semantics
  company: { type: 'string', max: 200 },
  country: { type: 'string', max: 100 },
  value: { type: 'number' },
};

const bulkDeleteSchema = {
  ids: { type: 'array', required: true },
};

// ============================================================
// STATIC ROUTES FIRST (before :id)
// ============================================================

// ---- Aggregations ----
router.get('/stats', OnlineCrmController.stats);
router.get('/monthly-volume', OnlineCrmController.monthlyVolume);
router.get('/by-country', OnlineCrmController.byCountry);
router.get('/top-products', OnlineCrmController.topProducts);
router.get('/countries', OnlineCrmController.countries);

// ---- Queries CRUD ----
router.get('/queries', OnlineCrmController.listQueries);
router.post(
  '/queries',
  validateBody(createQuerySchema),
  OnlineCrmController.createQuery
);

// ---- Bulk delete (before /queries/:id) ----
router.post(
  '/queries/bulk-delete',
  validateBody(bulkDeleteSchema),
  OnlineCrmController.bulkRemove
);

// ---- Single-query routes ----
router.get('/queries/:id', OnlineCrmController.getById);
router.patch(
  '/queries/:id',
  validateBody(updateQuerySchema),
  OnlineCrmController.updateQuery
);
router.delete('/queries/:id', OnlineCrmController.removeQuery);

module.exports = router;