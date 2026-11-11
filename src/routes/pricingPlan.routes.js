const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const pricingPlanController = require("../controllers/pricingPlan.controller");

// ============================================================
// PUBLIC ROUTES (no authentication required)
// ============================================================

/**
 * @route   GET /api/v1/pricing-plans
 * @desc    Get all active pricing plans (can filter by planType)
 * @access  Public
 * @query   planType - optional filter: "individual" or "team"
 */
router.get("/", pricingPlanController.getPlans);

/**
 * @route   GET /api/v1/pricing-plans/:slug
 * @desc    Get single plan by slug
 * @access  Public
 */
router.get("/:slug", pricingPlanController.getPlanBySlug);

// ============================================================
// ADMIN ROUTES (authentication required)
// ============================================================

/**
 * @route   GET /api/v1/pricing-plans/admin/all
 * @desc    Get all pricing plans including inactive (can filter by planType)
 * @access  Private (Admin only)
 * @query   planType - optional filter: "individual" or "team"
 */
router.get(
    "/admin/all",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.getAllPlansAdmin
);

/**
 * @route   POST /api/v1/pricing-plans
 * @desc    Create a new pricing plan
 * @access  Private (Admin only)
 */
router.post(
    "/",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.createPlan
);

/**
 * @route   PUT /api/v1/pricing-plans/:id
 * @desc    Update a pricing plan
 * @access  Private (Admin only)
 */
router.put(
    "/:id",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.updatePlan
);

/**
 * @route   DELETE /api/v1/pricing-plans/:id
 * @desc    Delete (soft) a pricing plan
 * @access  Private (Admin only)
 */
router.delete(
    "/:id",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.deletePlan
);

/**
 * @route   PATCH /api/v1/pricing-plans/:id/toggle
 * @desc    Toggle plan active status
 * @access  Private (Admin only)
 */
router.patch(
    "/:id/toggle",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.togglePlanStatus
);

/**
 * @route   POST /api/v1/pricing-plans/admin/order
 * @desc    Set plan display order
 * @access  Private (Admin only)
 */
router.post(
    "/admin/order",
    authenticate,
    requireRole("super_admin", "admin"),
    pricingPlanController.setPlanOrder
);

module.exports = router;