// src/routes/quotation/quotation.routes.js
const express = require('express');
const router = express.Router();

const { QuotationController } = require('../../controllers/quotation/quotation.controller');
const { validateBody } = require('../../middleware/rfq/validate');

const createSchema = {
  rfqId: { type: 'string', required: true },
};

const sendSchema = {};
const outcomeSchema = {
  outcome: { type: 'string', required: true, enum: ['won', 'lost'] },
};

// List + Create
router.get('/', QuotationController.list);
router.post('/', validateBody(createSchema), QuotationController.create);

// Stats (before :id)
router.get('/stats', QuotationController.stats);

// By RFQ (before :id)
router.get('/by-rfq/:rfqId', QuotationController.getByRfqId);

// Single
router.get('/:id', QuotationController.getById);
router.patch('/:id', QuotationController.update);
router.delete('/:id', QuotationController.remove);

// Actions
router.post('/:id/send', QuotationController.send);
router.post('/:id/approve', QuotationController.approve);
router.post('/:id/mark-outcome', validateBody(outcomeSchema), QuotationController.markOutcome);

module.exports = router;