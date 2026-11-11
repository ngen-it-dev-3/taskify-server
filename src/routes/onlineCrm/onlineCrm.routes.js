// src/routes/onlineCrm/onlineCrm.routes.js
const express = require('express');
const router = express.Router();

const {
  OnlineCrmController,
} = require('../../controllers/onlineCrm/onlineCrm.controller');
const { validateBody } = require('../../middleware/rfq/validate');
const { authenticate } = require('../../middleware/auth.middleware');  // ⭐ ADD

// ============================================================
// VALIDATION SCHEMAS
// ============================================================
const createQuerySchema = {
  company: { type: 'string', required: true, max: 200 },
  country: { type: 'string', required: true, max: 100 },
};

const updateQuerySchema = {
  company: { type: 'string', max: 200 },
  country: { type: 'string', max: 100 },
  value: { type: 'number' },
};

const bulkDeleteSchema = {
  ids: { type: 'array', required: true },
};

// ============================================================
// UNIFIED ROUTES
// ============================================================
router.get('/unified', OnlineCrmController.unifiedList);

// ⭐ Added `authenticate` so req.user is populated
router.get(
  '/unified/stats',
  authenticate,
  OnlineCrmController.unifiedStats
);

router.get('/unified/monthly-volume', OnlineCrmController.unifiedMonthly);
router.get('/unified/by-country', OnlineCrmController.unifiedByCountry);
router.get('/unified/top-products', OnlineCrmController.unifiedTop);

// ============================================================
// EXISTING — OnlineQuery endpoints (unchanged)
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

router.post(
  '/queries/bulk-delete',
  validateBody(bulkDeleteSchema),
  OnlineCrmController.bulkRemove
);

router.get('/queries/:id', OnlineCrmController.getById);
router.patch(
  '/queries/:id',
  validateBody(updateQuerySchema),
  OnlineCrmController.updateQuery
);
router.delete('/queries/:id', OnlineCrmController.removeQuery);
router.get('/unified/daily-volume', OnlineCrmController.unifiedDaily);

module.exports = router;