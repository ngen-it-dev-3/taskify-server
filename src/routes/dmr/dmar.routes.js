// src/routes/dmar/dmar.routes.js
const express = require('express');
const router = express.Router();

const { DmarController } = require('../../controllers/dmar/dmar.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// All DMAR routes require auth
router.use(authenticate);

// ============================================================
// STATIC ROUTES (before /:id)
// ============================================================
router.get('/stats', DmarController.getStats);
router.get('/sector-visits', DmarController.getSectorVisits);
router.get('/monthly-plan', DmarController.getMonthlyPlan);
router.get('/team-members', DmarController.getTeamMembers);
router.get('/constants', DmarController.getConstants);

// Settings upsert
router.put('/settings', DmarController.upsertSettings);

// ============================================================
// ACTIVITIES CRUD
// ============================================================
router.get('/activities', DmarController.listActivities);
router.post('/activities', DmarController.createActivity);

// ============================================================
// SCOPED /:id ROUTES
// ============================================================
router.get('/activities/:id', DmarController.getById);
router.patch('/activities/:id', DmarController.updateActivity);
router.patch('/activities/:id/sold', DmarController.markSold);
router.delete('/activities/:id', DmarController.removeActivity);

module.exports = router;