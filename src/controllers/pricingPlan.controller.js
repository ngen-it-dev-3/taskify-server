const { PricingPlan } = require("../models/PricingPlan.model");
const { createAuditLog } = require("./auditLog.controller");

// ============================================================
// GET ALL PLANS (Public) - with planType filter
// ============================================================
const getPlans = async (req, res) => {
    try {
        // ✅ Support planType filtering
        const { planType } = req.query;
        const filter = { isActive: true };

        if (planType && ["individual", "team"].includes(planType)) {
            filter.planType = planType;
        }

        const plans = await PricingPlan.find(filter).sort({ order: 1, name: 1 });

        // Format response with calculated prices
        const formattedPlans = plans.map((plan) => {
            const planObj = plan.toObject();

            let finalPrice = planObj.price || 0;
            let savings = 0;

            if (planObj.discount > 0 && planObj.price > 0) {
                finalPrice = planObj.price * (1 - planObj.discount / 100);
                savings = planObj.price - finalPrice;
            }

            return {
                ...planObj,
                finalPrice: Math.round(finalPrice),
                savings: Math.round(savings),
                originalPrice: planObj.price,
                currency: planObj.currency || "BDT",
            };
        });

        res.json({
            success: true,
            data: formattedPlans,
            count: formattedPlans.length,
        });
    } catch (error) {
        console.error("Get plans error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET SINGLE PLAN (Public)
// ============================================================
const getPlanBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const plan = await PricingPlan.findOne({ slug, isActive: true });

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        const planObj = plan.toObject();

        let finalPrice = planObj.price || 0;
        let savings = 0;

        if (planObj.discount > 0 && planObj.price > 0) {
            finalPrice = planObj.price * (1 - planObj.discount / 100);
            savings = planObj.price - finalPrice;
        }

        res.json({
            success: true,
            data: {
                ...planObj,
                finalPrice: Math.round(finalPrice),
                savings: Math.round(savings),
                originalPrice: planObj.price,
            },
        });
    } catch (error) {
        console.error("Get plan error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: GET ALL PLANS (including inactive)
// ============================================================
const getAllPlansAdmin = async (req, res) => {
    try {
        // ✅ Support planType filtering for admin
        const { planType } = req.query;
        const filter = {};

        if (planType && ["individual", "team"].includes(planType)) {
            filter.planType = planType;
        }

        const plans = await PricingPlan.find(filter).sort({ order: 1, name: 1 });

        const formattedPlans = plans.map((plan) => {
            const planObj = plan.toObject();

            let finalPrice = planObj.price || 0;
            let savings = 0;

            if (planObj.discount > 0 && planObj.price > 0) {
                finalPrice = planObj.price * (1 - planObj.discount / 100);
                savings = planObj.price - finalPrice;
            }

            return {
                ...planObj,
                finalPrice: Math.round(finalPrice),
                savings: Math.round(savings),
                originalPrice: planObj.price,
            };
        });

        res.json({
            success: true,
            data: formattedPlans,
            count: formattedPlans.length,
        });
    } catch (error) {
        console.error("Get all plans admin error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: CREATE PLAN
// ============================================================
const createPlan = async (req, res) => {
    try {
        const {
            name,
            description,
            icon,
            planType, // ✅ NEW FIELD
            isPopular,
            billingCycle,
            price,
            currency,
            discount,
            features,
            limits,
            trialDays,
            badge,
            color,
            order,
            isOneTime,
            contactSales,
        } = req.body;

        // Validate required fields
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Plan name is required",
            });
        }

        // ✅ Validate planType
        if (!planType || !["individual", "team"].includes(planType)) {
            return res.status(400).json({
                success: false,
                message: "Plan type is required and must be 'individual' or 'team'",
            });
        }

        // Check if plan already exists
        const existingPlan = await PricingPlan.findOne({
            name: { $regex: new RegExp("^" + name.trim() + "$", "i") }
        });
        if (existingPlan) {
            return res.status(400).json({
                success: false,
                message: "Plan with this name already exists",
            });
        }

        // Generate slug from name
        const slug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-");

        // Check if slug already exists
        const existingSlug = await PricingPlan.findOne({ slug });
        if (existingSlug) {
            return res.status(400).json({
                success: false,
                message: "Plan slug already exists. Please use a different name.",
            });
        }

        const planData = {
            name: name.trim(),
            slug: slug,
            description: description || "",
            icon: icon || "Users",
            planType: planType, // ✅ ADD PLAN TYPE
            isPopular: isPopular || false,
            isActive: true,
            billingCycle: billingCycle || "monthly",
            price: price || 0,
            currency: currency || "BDT",
            discount: discount || 0,
            features: features || [],
            limits: limits || {
                users: 1,
                projects: 0,
                tasks: 0,
                storage: 0,
                teamMembers: 0
            },
            trialDays: trialDays || 7,
            badge: badge || "",
            color: color || "indigo",
            order: order || 0,
            isOneTime: isOneTime || false,
            contactSales: contactSales || false,
        };

        const plan = await PricingPlan.create(planData);

        // Log audit
        if (createAuditLog) {
            await createAuditLog({
                action: "create",
                resource: "pricing_plan",
                resourceId: plan._id,
                userId: req.user?._id || null,
                user: req.user ? {
                    id: req.user._id,
                    name: req.user.fullName || req.user.name || "Unknown",
                    email: req.user.email || "unknown@example.com",
                    role: req.user.role || "user",
                } : {
                    id: null,
                    name: "System",
                    email: "system@example.com",
                    role: "system",
                },
                ip: req.ip || req.connection?.remoteAddress || "0.0.0.0",
                userAgent: req.headers["user-agent"] || "Unknown",
                details: {
                    method: "POST",
                    path: "/api/v1/pricing-plans",
                    status: "success",
                    planName: plan.name,
                    planSlug: plan.slug,
                    planType: plan.planType,
                },
                status: "success",
                severity: "low",
            });
        }

        res.status(201).json({
            success: true,
            message: "Pricing plan created successfully",
            data: plan,
        });
    } catch (error) {
        console.error("Create plan error:", error);

        // Handle validation errors
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(function (err) {
                return err.message;
            });
            return res.status(400).json({
                success: false,
                message: "Validation error: " + errors.join(", "),
            });
        }

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A plan with this name or slug already exists",
            });
        }

        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: UPDATE PLAN
// ============================================================
const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const plan = await PricingPlan.findById(id);
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        // ✅ Validate planType if being updated
        if (updates.planType && !["individual", "team"].includes(updates.planType)) {
            return res.status(400).json({
                success: false,
                message: "Plan type must be 'individual' or 'team'",
            });
        }

        // Prevent duplicate name
        if (updates.name && updates.name !== plan.name) {
            const existingPlan = await PricingPlan.findOne({
                name: { $regex: new RegExp("^" + updates.name.trim() + "$", "i") }
            });
            if (existingPlan && existingPlan._id.toString() !== id) {
                return res.status(400).json({
                    success: false,
                    message: "Plan with this name already exists",
                });
            }
        }

        // Generate slug if name is updated
        if (updates.name && updates.name !== plan.name) {
            updates.slug = updates.name
                .toLowerCase()
                .trim()
                .replace(/[^a-zA-Z0-9]/g, "-")
                .replace(/-+/g, "-");
        }

        const updatedPlan = await PricingPlan.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        // Log audit
        if (createAuditLog) {
            await createAuditLog({
                action: "update",
                resource: "pricing_plan",
                resourceId: updatedPlan._id,
                userId: req.user._id,
                user: {
                    id: req.user._id,
                    name: req.user.fullName,
                    email: req.user.email,
                    role: req.user.role,
                },
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers["user-agent"] || "Unknown",
                details: {
                    method: "PUT",
                    path: "/api/v1/pricing-plans/" + id,
                    status: "success",
                    planName: updatedPlan.name,
                    planType: updatedPlan.planType,
                },
                status: "success",
                severity: "low",
            });
        }

        res.json({
            success: true,
            message: "Pricing plan updated successfully",
            data: updatedPlan,
        });
    } catch (error) {
        console.error("Update plan error:", error);

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(function (err) {
                return err.message;
            });
            return res.status(400).json({
                success: false,
                message: "Validation error: " + errors.join(", "),
            });
        }

        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: DELETE PLAN (Soft Delete)
// ============================================================
const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await PricingPlan.findById(id);
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        // Soft delete - set isActive to false
        plan.isActive = false;
        await plan.save();

        res.json({
            success: true,
            message: "Pricing plan deleted successfully",
        });
    } catch (error) {
        console.error("Delete plan error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: TOGGLE PLAN STATUS
// ============================================================
const togglePlanStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await PricingPlan.findById(id);
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
            });
        }

        plan.isActive = !plan.isActive;
        await plan.save();

        res.json({
            success: true,
            message: "Plan " + (plan.isActive ? "activated" : "deactivated") + " successfully",
            data: { isActive: plan.isActive },
        });
    } catch (error) {
        console.error("Toggle plan status error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// ADMIN: SET PLAN ORDER
// ============================================================
const setPlanOrder = async (req, res) => {
    try {
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders)) {
            return res.status(400).json({
                success: false,
                message: "Orders array is required",
            });
        }

        // Update each plan's order
        for (var i = 0; i < orders.length; i++) {
            var item = orders[i];
            await PricingPlan.findByIdAndUpdate(item.id, { order: item.order });
        }

        res.json({
            success: true,
            message: "Plan order updated successfully",
        });
    } catch (error) {
        console.error("Set plan order error:", error);
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
    getPlans,
    getPlanBySlug,
    getAllPlansAdmin,
    createPlan,
    updatePlan,
    deletePlan,
    togglePlanStatus,
    setPlanOrder,
};