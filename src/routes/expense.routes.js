// routes/expense.routes.js
const express = require("express");
const { body } = require("express-validator");
const {
    submitExpense,
    getMyExpenses,
    getApprovalQueue,
    getAllExpenses,
    updateExpense,
    approveExpense,
    batchApproveExpenses,
    rejectExpense,
    getExpenseById,
    markAsPaid,
    deleteExpense,
    getExpenseStats,
} = require("../controllers/expense.controller");
const { authenticate, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Roles that can approve / reject / mark-paid
const APPROVER_ROLES = ["super_admin", "admin", "hr_manager"];

// ============================================================
// EMPLOYEE ROUTES
// ============================================================
router.post(
    "/",
    [
        body("title").notEmpty().withMessage("Title is required"),
        body("category")
            .isIn([
                "transport",
                "meals",
                "entertainment",
                "office_supply",
                "accommodation",
                "personal",
                "other",
            ])
            .withMessage("Invalid category"),
        body("amount")
            .isNumeric()
            .withMessage("Amount must be a number")
            .custom((v) => Number(v) > 0)
            .withMessage("Amount must be greater than 0"),
        body("currency")
            .optional()
            .isIn(["BDT", "SAR", "USD", "AED", "INR", "EUR", "GBP"])
            .withMessage("Invalid currency"),
        body("expenseDate")
            .isISO8601()
            .withMessage("Valid expense date is required"),
    ],
    submitExpense
);

router.get("/my", getMyExpenses);
router.get("/stats", getExpenseStats);

// ============================================================
// APPROVER ROUTES — admin / super_admin / hr_manager ONLY
// ============================================================

// Get ALL expenses across every employee
router.get("/all", requireRole(...APPROVER_ROLES), getAllExpenses);

// Approval queue (grouped by employee)
router.get(
    "/approval-queue",
    requireRole(...APPROVER_ROLES),
    getApprovalQueue
);

// Approve single
router.patch("/:id/approve", requireRole(...APPROVER_ROLES), approveExpense);

// Reject single (requires reason)
router.patch(
    "/:id/reject",
    requireRole(...APPROVER_ROLES),
    [
        body("rejectionReason")
            .notEmpty()
            .withMessage("Rejection reason is required"),
    ],
    rejectExpense
);

// Batch approve all pending for one employee
router.post(
    "/employee/:employeeId/batch-approve",
    requireRole(...APPROVER_ROLES),
    batchApproveExpenses
);

// Mark as paid (feeds payroll)
router.patch("/:id/mark-paid", requireRole(...APPROVER_ROLES), markAsPaid);

// ============================================================
// UPDATE (owner while pending / admin anytime)
// ============================================================
router.put(
    "/:id",
    [
        body("title").optional().isString().withMessage("Title must be a string"),
        body("category")
            .optional()
            .isIn([
                "transport",
                "meals",
                "entertainment",
                "office_supply",
                "accommodation",
                "personal",
                "other",
            ])
            .withMessage("Invalid category"),
        body("amount")
            .optional()
            .isNumeric()
            .withMessage("Amount must be a number")
            .custom((v) => Number(v) > 0)
            .withMessage("Amount must be greater than 0"),
        body("currency")
            .optional()
            .isIn(["BDT", "SAR", "USD", "AED", "INR", "EUR", "GBP"])
            .withMessage("Invalid currency"),
        body("expenseDate")
            .optional()
            .isISO8601()
            .withMessage("Valid expense date is required"),
    ],
    updateExpense
);

// ============================================================
// SHARED — must come AFTER all named routes
// ============================================================
router.get("/:id", getExpenseById);
router.delete("/:id", deleteExpense);

module.exports = router;