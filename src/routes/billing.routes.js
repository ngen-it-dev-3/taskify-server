// routes/billing.routes.js
const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const billingController = require("../controllers/billing.controller");

// All routes require authentication
router.use(authenticate);

// Billing summary
router.get("/summary", billingController.getBillingSummary);

// Invoices
router.get("/invoices", billingController.getInvoices);
router.get("/invoices/:id", billingController.getInvoiceById);
router.get("/invoices/:id/download", billingController.downloadInvoice);

// Subscriptions
router.get("/subscriptions", billingController.getSubscriptions);
router.get("/subscriptions/:id", billingController.getSubscriptionById);
router.put("/subscriptions/:id/cancel", billingController.cancelSubscription);
router.put("/subscriptions/:id/renew", billingController.renewSubscription);

// Transactions
router.get("/transactions", billingController.getTransactions);
router.get("/transactions/:id", billingController.getTransactionById);

// Accounts
router.get("/accounts", billingController.getBillingAccounts);
router.get("/accounts/:id", billingController.getBillingAccountById);

// Payment Methods
router.get("/payment-methods", billingController.getPaymentMethods);
router.post("/payment-methods", billingController.addPaymentMethod);
router.delete("/payment-methods/:id", billingController.removePaymentMethod);
router.put("/payment-methods/:id/default", billingController.setDefaultPaymentMethod);

// Trial
router.get("/trial", billingController.getTrialInfo);
router.post("/trial/extend", billingController.extendTrial);

// Admin only routes (using your requireRole middleware)
router.get("/admin/accounts", requireRole("super_admin", "admin"), billingController.getAllBillingAccounts);
router.get("/admin/stats", requireRole("super_admin", "admin"), billingController.getAdminBillingStats);

module.exports = router;