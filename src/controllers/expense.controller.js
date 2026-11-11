// controllers/expense.controller.js
const mongoose = require("mongoose");

// ⚠️ Expense.model.js exports the model DIRECTLY → no curly braces
const Expense = require("../models/Expense.model");

// These use the wrapper-object export pattern → keep the braces
const { User } = require("../models/User.model");
const { createNotification } = require("./notification.controller");

// ============================================================
// ROLE PERMISSIONS
// ============================================================

/**
 * Roles allowed to approve/reject expenses.
 * Only these three — NOT dept_manager, project_manager, line_manager.
 */
const APPROVER_ROLES = ["super_admin", "admin", "hr_manager"];

const canApprove = (user) =>
    !!user && APPROVER_ROLES.includes(user.role);

/**
 * Notify all users with approver roles.
 */
const notifyAllApprovers = async (expense) => {
    try {
        const approvers = await User.find({
            role: { $in: APPROVER_ROLES },
            isActive: true,
        })
            .select("_id")
            .lean();

        await Promise.all(
            approvers.map((u) =>
                createNotification({
                    userId: u._id,
                    title: "New Expense Approval Request",
                    message: `${expense.employeeName} submitted "${expense.title}" (৳${expense.amount})`,
                    type: "info",
                    category: "expense",
                    actionUrl: "/expenses",
                    metadata: {
                        expenseId: expense._id.toString(),
                        amount: expense.amount,
                        category: expense.category,
                        employeeId: expense.employeeId.toString(),
                    },
                }).catch((err) =>
                    console.error("Expense notification error:", err.message)
                )
            )
        );
    } catch (err) {
        console.warn("notifyAllApprovers failed:", err.message);
    }
};

/**
 * GPS verification — mark expense as verified when we have coords + label.
 */
const tryGpsVerify = (expense) => {
    const hasCoords =
        typeof expense.location?.lat === "number" &&
        typeof expense.location?.lng === "number";
    const hasLabel = !!expense.location?.label;

    if (hasCoords && hasLabel) {
        expense.gpsVerified = true;
        expense.gpsVerification = {
            verified: true,
            matchedLocation: expense.location.label,
            note: `GPS verified: you were at ${expense.location.label} on ${new Date(
                expense.expenseDate
            ).toLocaleDateString()}`,
            verifiedAt: new Date(),
        };
    } else {
        expense.gpsVerified = false;
        expense.gpsVerification = {
            verified: false,
            matchedLocation: "",
            note: "",
            verifiedAt: null,
        };
    }
};

// ============================================================
// SUBMIT A NEW EXPENSE
// ============================================================
const submitExpense = async (req, res) => {
    try {
        const user = req.user;
        const {
            title,
            description,
            category,
            amount,
            currency,
            guests,
            expenseDate,
            location,
            taskId,
            receiptUrl,
            receiptThumbnailUrl,
        } = req.body;

        // ---------- Required field validation ----------
        if (!title?.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "Title is required" });
        }

        if (!category) {
            return res
                .status(400)
                .json({ success: false, message: "Category is required" });
        }

        if (typeof amount !== "number" || amount <= 0) {
            return res
                .status(400)
                .json({ success: false, message: "Amount must be greater than 0" });
        }

        if (!expenseDate) {
            return res
                .status(400)
                .json({ success: false, message: "Expense date is required" });
        }

        if (new Date(expenseDate) > new Date()) {
            return res.status(400).json({
                success: false,
                message: "Expense date cannot be in the future",
            });
        }

        // ---------- Currency validation ----------
        const ALLOWED_CURRENCIES = [
            "BDT",
            "SAR",
            "USD",
            "AED",
            "INR",
            "EUR",
            "GBP",
        ];

        const finalCurrency = String(currency || "BDT").toUpperCase();

        if (!ALLOWED_CURRENCIES.includes(finalCurrency)) {
            return res.status(400).json({
                success: false,
                message: `Currency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`,
            });
        }

        // ---------- Build the expense ----------
        const expense = new Expense({
            employeeId: user._id,
            employeeName: user.fullName || user.email,
            employeeEmail: user.email,
            title: title.trim(),
            description: description?.trim() || "",
            category,
            amount,
            currency: finalCurrency, // 👈 validated + uppercased
            guests: category === "meals" ? guests || 0 : 0,
            expenseDate: new Date(expenseDate),
            location: {
                lat: location?.lat ?? null,
                lng: location?.lng ?? null,
                label: location?.label?.trim() || "",
            },
            taskId: taskId || null,
            receiptUrl: receiptUrl || "",
            receiptThumbnailUrl: receiptThumbnailUrl || "",
            status: "pending",
            submittedAt: new Date(),
        });

        // ---------- GPS verification ----------
        tryGpsVerify(expense);

        // ---------- Save ----------
        await expense.save();

        // ---------- Notify approvers in the background ----------
        notifyAllApprovers(expense);

        // ---------- Respond ----------
        res.status(201).json({
            success: true,
            message: "Expense submitted successfully",
            data: expense,
        });
    } catch (error) {
        console.error("Submit expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET MY EXPENSES
// ============================================================
const getMyExpenses = async (req, res) => {
    try {
        const user = req.user;
        const { status, category, month, year, page = 1, limit = 50 } = req.query;

        const query = { employeeId: user._id };
        if (status && status !== "all") query.status = status;
        if (category && category !== "all") query.category = category;

        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            query.expenseDate = {
                $gte: new Date(y, m - 1, 1),
                $lte: new Date(y, m, 0, 23, 59, 59),
            };
        }

        const [expenses, total, summary] = await Promise.all([
            Expense.find(query)
                .sort({ expenseDate: -1, createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            Expense.countDocuments(query),
            month && year
                ? Expense.monthlySummary(user._id, parseInt(year), parseInt(month))
                : Promise.resolve(null),
        ]);

        res.json({
            success: true,
            data: expenses,
            summary,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Get my expenses error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET APPROVAL QUEUE (approvers only — admin/super/HR)
// ============================================================
const getApprovalQueue = async (req, res) => {
    try {
        const user = req.user;

        if (!canApprove(user)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can view the approval queue",
            });
        }

        const { status = "pending", page = 1, limit = 50 } = req.query;

        const query = {};
        if (status && status !== "all") query.status = status;

        const [expenses, total] = await Promise.all([
            Expense.find(query)
                .populate("employeeId", "fullName email role avatar profilePhoto")
                .populate("approvedBy", "fullName email")
                .sort({ submittedAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            Expense.countDocuments(query),
        ]);

        // Group by employee for the batch-approve UI
        const groupedByEmployee = {};
        expenses.forEach((exp) => {
            const key = exp.employeeId?._id?.toString() || "unknown";
            if (!groupedByEmployee[key]) {
                groupedByEmployee[key] = {
                    employee: exp.employeeId,
                    expenses: [],
                    totalAmount: 0,
                    pendingCount: 0,
                };
            }
            groupedByEmployee[key].expenses.push(exp);
            groupedByEmployee[key].totalAmount += exp.amount;
            if (exp.status === "pending") groupedByEmployee[key].pendingCount++;
        });

        res.json({
            success: true,
            data: {
                flat: expenses,
                grouped: Object.values(groupedByEmployee),
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Get approval queue error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// APPROVE A SINGLE EXPENSE (admin/super/HR only)
// ============================================================
const approveExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        if (!canApprove(user)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can approve expenses",
            });
        }

        const expense = await Expense.findById(id);
        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        if (expense.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Cannot approve — expense is already ${expense.status}`,
            });
        }

        expense.status = "approved";
        expense.approvedBy = user._id;
        expense.approvedAt = new Date();
        expense.rejectionReason = ""; // clear any old value
        await expense.save();

        try {
            await createNotification({
                userId: expense.employeeId,
                title: "Expense Approved ✅",
                message: `Your expense "${expense.title}" (৳${expense.amount}) has been approved by ${user.fullName || "HR"}.`,
                type: "success",
                category: "expense",
                actionUrl: "/expenses",
                metadata: { expenseId: expense._id.toString() },
            });
        } catch (err) {
            console.warn("Notify employee error:", err.message);
        }

        res.json({
            success: true,
            message: "Expense approved",
            data: expense,
        });
    } catch (error) {
        console.error("Approve expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// REJECT A SINGLE EXPENSE (with reason) — admin/super/HR only
// ============================================================
const rejectExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;
        const user = req.user;

        if (!canApprove(user)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can reject expenses",
            });
        }

        if (!rejectionReason?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required",
            });
        }

        if (rejectionReason.trim().length > 500) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason cannot exceed 500 characters",
            });
        }

        const expense = await Expense.findById(id);
        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        if (expense.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Cannot reject — expense is already ${expense.status}`,
            });
        }

        expense.status = "rejected";
        expense.rejectionReason = rejectionReason.trim();
        expense.approvedBy = user._id;
        expense.approvedAt = new Date();
        await expense.save();

        try {
            await createNotification({
                userId: expense.employeeId,
                title: "Expense Rejected ❌",
                message: `Your expense "${expense.title}" (৳${expense.amount}) was rejected. Reason: ${rejectionReason.trim()}`,
                type: "error",
                category: "expense",
                actionUrl: "/expenses",
                metadata: {
                    expenseId: expense._id.toString(),
                    rejectionReason: rejectionReason.trim(),
                    rejectedBy: user.fullName || "HR",
                },
            });
        } catch (err) {
            console.warn("Notify employee error:", err.message);
        }

        res.json({
            success: true,
            message: "Expense rejected",
            data: expense,
        });
    } catch (error) {
        console.error("Reject expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// BATCH APPROVE — admin/super/HR only
// ============================================================
const batchApproveExpenses = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { expenseIds } = req.body;
        const user = req.user;

        if (!canApprove(user)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can approve expenses",
            });
        }

        const query = { employeeId, status: "pending" };
        if (Array.isArray(expenseIds) && expenseIds.length > 0) {
            query._id = { $in: expenseIds };
        }

        const pending = await Expense.find(query).lean();

        if (pending.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No pending expenses found for this employee",
            });
        }

        const ids = pending.map((p) => p._id);
        await Expense.updateMany(
            { _id: { $in: ids } },
            {
                $set: {
                    status: "approved",
                    approvedBy: user._id,
                    approvedAt: new Date(),
                    rejectionReason: "",
                },
            }
        );

        const totalAmount = pending.reduce((sum, e) => sum + e.amount, 0);

        try {
            await createNotification({
                userId: employeeId,
                title: `${pending.length} Expenses Approved ✅`,
                message: `Your pending expenses (৳${totalAmount.toLocaleString()}) have been approved by ${user.fullName || "HR"}.`,
                type: "success",
                category: "expense",
                actionUrl: "/expenses",
            });
        } catch (err) {
            console.warn("Notify employee error:", err.message);
        }

        res.json({
            success: true,
            message: `${pending.length} expense(s) approved`,
            data: {
                modifiedCount: pending.length,
                totalAmount,
                expenseIds: ids,
            },
        });
    } catch (error) {
        console.error("Batch approve error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET SINGLE EXPENSE
// ============================================================
const getExpenseById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const expense = await Expense.findById(id)
            .populate("employeeId", "fullName email role avatar profilePhoto")
            .populate("approvedBy", "fullName email")
            .lean();

        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        const isOwner =
            expense.employeeId?._id?.toString() === user._id.toString();
        const isApprover = canApprove(user);

        if (!isOwner && !isApprover) {
            return res
                .status(403)
                .json({ success: false, message: "Not authorized" });
        }

        res.json({ success: true, data: expense });
    } catch (error) {
        console.error("Get expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// MARK AS PAID — admin/super/HR only
// ============================================================
const markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        if (!APPROVER_ROLES.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can mark as paid",
            });
        }

        const expense = await Expense.findById(id);
        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        if (expense.status !== "approved") {
            return res.status(400).json({
                success: false,
                message: "Only approved expenses can be marked as paid",
            });
        }

        expense.status = "paid";
        expense.payrollSynced = true;
        expense.payrollSyncedAt = new Date();
        await expense.save();

        res.json({
            success: true,
            message: "Expense marked as paid",
            data: expense,
        });
    } catch (error) {
        console.error("Mark paid error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// DELETE
// ============================================================
const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const expense = await Expense.findById(id);
        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        const isOwner = expense.employeeId.toString() === user._id.toString();
        const isAdmin = ["super_admin", "admin", "hr_manager"].includes(user.role);

        if (!isOwner && !isAdmin) {
            return res
                .status(403)
                .json({ success: false, message: "Not authorized" });
        }

        if (expense.status !== "pending" && !isAdmin) {
            return res.status(400).json({
                success: false,
                message: "Only pending expenses can be deleted",
            });
        }

        await expense.deleteOne();

        res.json({ success: true, message: "Expense deleted" });
    } catch (error) {
        console.error("Delete expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// STATS
// ============================================================
const getExpenseStats = async (req, res) => {
    try {
        const user = req.user;
        const { month, year } = req.query;

        const m = month ? parseInt(month) : new Date().getMonth() + 1;
        const y = year ? parseInt(year) : new Date().getFullYear();

        let employeeQuery = {};
        if (!["super_admin", "admin", "hr_manager"].includes(user.role)) {
            employeeQuery.employeeId = user._id;
        }

        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0, 23, 59, 59);

        const result = await Expense.aggregate([
            {
                $match: {
                    ...employeeQuery,
                    expenseDate: { $gte: start, $lte: end },
                },
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    total: { $sum: "$amount" },
                },
            },
        ]);

        const stats = {
            pending: { count: 0, total: 0 },
            approved: { count: 0, total: 0 },
            rejected: { count: 0, total: 0 },
            paid: { count: 0, total: 0 },
        };

        result.forEach((r) => {
            stats[r._id] = { count: r.count, total: r.total };
        });

        res.json({ success: true, data: stats, month: m, year: y });
    } catch (error) {
        console.error("Get expense stats error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET ALL EXPENSES (admin / super_admin / hr_manager only)
// ============================================================
const getAllExpenses = async (req, res) => {
    try {
        const user = req.user;

        if (!canApprove(user)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin, Super Admin, or HR can view all expenses",
            });
        }

        const {
            status,
            category,
            month,
            year,
            employeeId,
            page = 1,
            limit = 200,
        } = req.query;

        const query = {};
        if (status && status !== "all") query.status = status;
        if (category && category !== "all") query.category = category;
        if (employeeId) query.employeeId = employeeId;

        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            query.expenseDate = {
                $gte: new Date(y, m - 1, 1),
                $lte: new Date(y, m, 0, 23, 59, 59),
            };
        }

        const [expenses, total] = await Promise.all([
            Expense.find(query)
                .populate("employeeId", "fullName email role avatar profilePhoto")
                .populate("approvedBy", "fullName email")
                .sort({ expenseDate: -1, createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            Expense.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: expenses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Get all expenses error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};
// ============================================================
// UPDATE AN EXPENSE (owner can edit while pending; admins anytime)
// ============================================================
const updateExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const expense = await Expense.findById(id);
        if (!expense) {
            return res
                .status(404)
                .json({ success: false, message: "Expense not found" });
        }

        const isOwner =
            expense.employeeId.toString() === user._id.toString();
        const isAdmin = APPROVER_ROLES.includes(user.role);

        // Permission: owner can only edit pending; admins can edit anything
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to edit this expense",
            });
        }

        if (!isAdmin && expense.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `You can only edit expenses while they are pending. This one is already ${expense.status}.`,
            });
        }

        // Whitelist of updatable fields
        const {
            title,
            description,
            category,
            amount,
            guests,
            expenseDate,
            location,
            receiptUrl,
            receiptThumbnailUrl,
            taskId,
        } = req.body;

        if (title !== undefined) {
            if (!title.trim()) {
                return res
                    .status(400)
                    .json({ success: false, message: "Title cannot be empty" });
            }
            expense.title = title.trim();
        }

        if (description !== undefined) {
            expense.description = description?.trim() || "";
        }

        if (category !== undefined) {
            const validCategories = [
                "transport",
                "meals",
                "entertainment",
                "office_supply",
                "accommodation",
                "personal",
                "other",
            ];
            if (!validCategories.includes(category)) {
                return res
                    .status(400)
                    .json({ success: false, message: "Invalid category" });
            }
            expense.category = category;
        }

        if (amount !== undefined) {
            const amountNum = Number(amount);
            if (!Number.isFinite(amountNum) || amountNum <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Amount must be greater than 0",
                });
            }
            expense.amount = amountNum;
        }

        if (guests !== undefined) {
            expense.guests =
                expense.category === "meals" ? Number(guests) || 0 : 0;
        }

        if (expenseDate !== undefined) {
            const d = new Date(expenseDate);
            if (isNaN(d.getTime())) {
                return res
                    .status(400)
                    .json({ success: false, message: "Invalid expense date" });
            }
            if (d > new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Expense date cannot be in the future",
                });
            }
            expense.expenseDate = d;
        }

        if (location !== undefined) {
            expense.location = {
                lat:
                    location?.lat !== undefined && location?.lat !== null
                        ? Number(location.lat)
                        : null,
                lng:
                    location?.lng !== undefined && location?.lng !== null
                        ? Number(location.lng)
                        : null,
                label: location?.label?.trim() || "",
            };
            // Re-run GPS verification after location update
            tryGpsVerify(expense);
        }

        if (receiptUrl !== undefined) {
            expense.receiptUrl = receiptUrl || "";
        }

        if (receiptThumbnailUrl !== undefined) {
            expense.receiptThumbnailUrl = receiptThumbnailUrl || "";
        }

        if (taskId !== undefined) {
            expense.taskId = taskId || null;
        }

        await expense.save();

        res.json({
            success: true,
            message: "Expense updated successfully",
            data: expense,
        });
    } catch (error) {
        console.error("Update expense error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    submitExpense,
    getMyExpenses,
    getApprovalQueue,
    approveExpense,
    batchApproveExpenses,
    getAllExpenses,
    rejectExpense,
    getExpenseById,
    markAsPaid,
    deleteExpense,
    getExpenseStats,
    updateExpense,
};