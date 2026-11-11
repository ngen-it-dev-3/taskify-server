// src/routes/rfq/rfq.routes.js
const express = require('express');
const router = express.Router();

const { RFQController } = require('../../controllers/rfq/rfq.controller');
const { upload } = require('../../config/upload');
const { validateBody } = require('../../middleware/rfq/validate');

// ---- Optional auth (remove if your app has global auth middleware) ----
// const { protect } = require('../middleware/auth');

// ============================================================
// Validation schemas (compact, using our tiny validator)
// ============================================================
const productRule = { type: 'array' };

const createSchema = {
  company: { type: 'string', required: true, max: 200 },
  country: { type: 'string', required: true },
  contactName: { type: 'string', required: true },
  email: { type: 'string', required: true, email: true },
  products: { type: 'array', required: true },
  source: { enum: ['online', 'manual'] },
  priority: { enum: ['low', 'normal', 'high', 'urgent'] },
  receivedVia: {
    enum: ['Email', 'Phone', 'WhatsApp', 'In-Person', 'Other'],
  },
};

const assignSchema = {
  assignedTo: { type: 'string', required: true },
  priority: { enum: ['low', 'normal', 'high', 'urgent'] },
};

// ⭐ UPDATED: Now allows all fields sent from the Edit Form
const updateSchema = {
  // Company & Contact Info
  company: { type: 'string', max: 200 },
  country: { type: 'string' },
  contactName: { type: 'string' },
  email: { type: 'string', email: true },
  phone: { type: 'string' },
  designation: { type: 'string' },
  address: { type: 'string' },
  city: { type: 'string' },
  zipCode: { type: 'string' },
  isReseller: { type: 'boolean' },
  
  // Nested Info (if you keep clientInfo)
  clientInfo: { type: 'object' },
  
  // Additional Details
  projectName: { type: 'string' },
  tentativeBudget: { type: 'string' },
  currentProjectStatus: { type: 'string' },
  tentativePurchaseDate: { type: 'string' },
  comment: { type: 'string' },
  
  // Products
  products: { type: 'array' },
  
  // Existing Actions
  stage: { enum: ['pending', 'quoted', 'archived', 'lost'] },
  priority: { enum: ['low', 'normal', 'high', 'urgent'] },
  assignedTo: { type: 'string' },
  salesman: { type: 'string' },
};

// ============================================================
// Routes
// ============================================================

// List + Create
router.get('/', RFQController.list);
router.post('/', validateBody(createSchema), RFQController.create);

// Stats (before :id)
router.get('/stats', RFQController.stats);

// Sync from Web Portal
router.post('/sync', RFQController.sync);

// Product file uploads (multipart/form-data)
router.post(
  '/upload',
  upload.array('files', 10),
  RFQController.uploadFiles
);

// Single RFQ
router.get('/:id', RFQController.getById);
router.patch('/:id', validateBody(updateSchema), RFQController.update);
router.delete('/:id', RFQController.remove);

// Actions
router.post('/:id/assign', validateBody(assignSchema), RFQController.assign);
router.post('/:id/archive', RFQController.archive);
router.post('/:id/unarchive', RFQController.unarchive);

module.exports = router;