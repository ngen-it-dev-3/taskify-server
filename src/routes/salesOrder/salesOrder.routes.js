// src/routes/salesOrder/salesOrder.routes.js
const express = require('express');
const router = express.Router();

const { SalesOrderController } = require('../../controllers/salesOrder/salesOrder.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

// Static routes first
router.get('/constants', SalesOrderController.getConstants);
router.get('/stats', SalesOrderController.getStats);

// CRUD
router.get('/', SalesOrderController.listOrders);
router.post('/', SalesOrderController.createManual);

// Scoped /:id
router.get('/:id', SalesOrderController.getById);
router.patch('/:id', SalesOrderController.updateOrder);
router.patch('/:id/stage', SalesOrderController.advanceStage);
router.delete('/:id', SalesOrderController.deleteOrder);

module.exports = router;