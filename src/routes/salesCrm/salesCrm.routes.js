// src/routes/salesCrm/salesCrm.routes.js
const express = require('express');
const router = express.Router();

const {
  SalesCrmController,
} = require('../../controllers/salesCrm/salesCrm.controller');
const { validateBody } = require('../../middleware/rfq/validate');

// ============================================================
// Validation schemas
// ============================================================
const createEntrySchema = {
  client: { type: 'string', required: true },
  // Optional but typed — rejected if wrong shape
  value: { type: 'number' },
  probability: { type: 'number' },
};

const updateEntrySchema = {
  // All fields optional — PATCH semantics
  client: { type: 'string' },
  value: { type: 'number' },
  probability: { type: 'number' },
};

const bulkDeleteSchema = {
  ids: { type: 'array', required: true },
};

// ============================================================
// STATIC ROUTES FIRST (before :id, to avoid route shadowing)
// ============================================================

// ---- Pipeline & reporting aggregations ----
router.get('/pipeline', SalesCrmController.getPipeline);
router.get('/forecast/kpis', SalesCrmController.getForecastKpis);
router.get('/forecast/trend', SalesCrmController.getForecastTrend);
router.get('/forecast/breakdown', SalesCrmController.getBreakdown);
router.get('/forecast/by-salesperson', SalesCrmController.getBySalesperson);
router.get('/sales-report', SalesCrmController.getSalesReport);

// ---- Entries (list + create) ----
router.get('/entries', SalesCrmController.listEntries);
router.post(
  '/entries',
  validateBody(createEntrySchema),
  SalesCrmController.createEntry
);

// ---- Bulk delete (BEFORE /entries/:id — different path segment, safe either way) ----
router.post(
  '/entries/bulk-delete',
  validateBody(bulkDeleteSchema),
  SalesCrmController.bulkRemove
);

// ---- Single-entry routes (:id) ----
router.get('/entries/:id', SalesCrmController.getById);
router.patch(
  '/entries/:id',
  validateBody(updateEntrySchema),
  SalesCrmController.updateEntry
);
router.delete('/entries/:id', SalesCrmController.removeEntry);

module.exports = router;