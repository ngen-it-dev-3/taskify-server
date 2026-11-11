// src/routes/client360/client360.routes.js
const express = require('express');
const router = express.Router();

const {
    Client360Controller,
} = require('../../controllers/client360/client360.controller');
const { authenticate } = require('../../middleware/auth.middleware');

// All routes require auth
router.use(authenticate);

// ============================================================
// STATIC ROUTES (must come before /:id)
// ============================================================
router.get('/constants', Client360Controller.getConstants);
router.get('/stats', Client360Controller.getStats);
router.get('/sector-breakdown', Client360Controller.getSectorBreakdown);

// ============================================================
// CLIENT CRUD
// ============================================================
router.get('/', Client360Controller.listClients);
router.post('/', Client360Controller.createManual);

// ============================================================
// SCOPED /:id ROUTES
// ============================================================
router.get('/:id', Client360Controller.getById);
router.patch('/:id', Client360Controller.updateClient);
router.delete('/:id', Client360Controller.deleteClient);

// ============================================================
// CONTACTS (nested under client)
// ============================================================
router.post('/:id/contacts', Client360Controller.addContact);
router.patch('/:id/contacts/:contactId', Client360Controller.updateContact);
router.delete('/:id/contacts/:contactId', Client360Controller.deleteContact);

// ============================================================
// COMMUNICATION LOG
// ============================================================
router.post('/:id/communications', Client360Controller.addCommunication);
router.get('/:id/quotations', Client360Controller.getClientQuotations);

// ⭐ NEW: Update and Delete for Communication Log
router.patch('/:id/communications/:logId', Client360Controller.updateCommunication);
router.delete('/:id/communications/:logId', Client360Controller.deleteCommunication);


// ============================================================
// QUOTES & CONTRACTS (⭐ নতুন যোগ করা হলো)
// ============================================================
router.post('/:id/quotes', Client360Controller.addQuote);
router.patch('/:id/quotes/:quoteId', Client360Controller.updateQuote);
router.delete('/:id/quotes/:quoteId', Client360Controller.deleteQuote);

router.post('/:id/contracts', Client360Controller.addContract);
router.patch('/:id/contracts/:contractId', Client360Controller.updateContract);
router.delete('/:id/contracts/:contractId', Client360Controller.deleteContract);

router.get('/:id/quotations', Client360Controller.getClientQuotations);

module.exports = router;