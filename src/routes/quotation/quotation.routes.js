// src/routes/quotation/quotation.routes.js
const express = require('express');
const router = express.Router();

const { QuotationController } = require('../../controllers/quotation/quotation.controller');
const { validateBody } = require('../../middleware/rfq/validate');

const createSchema = {
  rfqId: { type: 'string', required: true },
};

const outcomeSchema = {
  outcome: { type: 'string', required: true, enum: ['won', 'lost'] },
};

// ==========================================
// 1. Specific Routes (Must go before /:id)
// ==========================================

// List + Create
router.get('/', QuotationController.list);
router.post('/', validateBody(createSchema), QuotationController.create);

// Stats
router.get('/stats', QuotationController.stats);

// By RFQ
router.get('/by-rfq/:rfqId', QuotationController.getByRfqId);

// ⭐ Document Upload for Sources
router.post('/upload-source-docs', QuotationController.uploadSourceDocs);


// ==========================================
// 2. Dynamic ID Routes
// ==========================================

// Single Quotation
router.get('/:id', QuotationController.getById);
router.patch('/:id', QuotationController.update);
router.delete('/:id', QuotationController.remove);

// Quotation Actions
router.post('/:id/send', QuotationController.send);
router.post('/:id/approve', QuotationController.approve);
router.post('/:id/mark-outcome', validateBody(outcomeSchema), QuotationController.markOutcome);

module.exports = router;