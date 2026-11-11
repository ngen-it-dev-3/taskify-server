const mongoose = require("mongoose");

const pricingPlanSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Plan name is required"],
            trim: true,
            unique: true,
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        icon: {
            type: String,
            default: "Users",
        },
        // ✅ PLAN TYPE - NEW FIELD
        planType: {
            type: String,
            enum: ["individual", "team"],
            required: [true, "Plan type is required"],
            default: "individual",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isPopular: {
            type: Boolean,
            default: false,
        },
        // SINGLE BILLING CYCLE - not all at once
        billingCycle: {
            type: String,
            enum: ["monthly", "quarterly", "semiannual", "yearly", "one-time"],
            default: "monthly",
        },
        price: {
            type: Number,
            default: 0,
        },
        currency: {
            type: String,
            default: "BDT",
        },
        discount: {
            type: Number,
            default: 0, // Percentage discount
        },
        // Original price before discount (for displaying savings)
        originalPrice: {
            type: Number,
            default: 0,
        },
        features: {
            type: [String],
            default: [],
        },
        limits: {
            users: { type: Number, default: 1 },
            projects: { type: Number, default: 0 },
            tasks: { type: Number, default: 0 },
            storage: { type: Number, default: 0 },
            teamMembers: { type: Number, default: 0 },
        },
        trialDays: {
            type: Number,
            default: 7,
        },
        badge: {
            type: String,
            enum: ["", "popular", "best-value", "enterprise", "free"],
            default: "",
        },
        color: {
            type: String,
            default: "indigo",
        },
        order: {
            type: Number,
            default: 0,
        },
        // For one-time purchase (enterprise)
        isOneTime: {
            type: Boolean,
            default: false,
        },
        contactSales: {
            type: Boolean,
            default: false,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
pricingPlanSchema.index({ slug: 1 });
pricingPlanSchema.index({ isActive: 1 });
pricingPlanSchema.index({ order: 1 });
pricingPlanSchema.index({ planType: 1 }); // ✅ ADD INDEX FOR PLAN TYPE

// Pre-save middleware to generate slug
pricingPlanSchema.pre("save", function (next) {
    if (this.isModified("name")) {
        this.slug = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-");
    }
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-");
    }
    next();
});

// Pre-validate middleware
pricingPlanSchema.pre("validate", function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-zA-Z0-9]/g, "-")
            .replace(/-+/g, "-");
    }
    next();
});

// Method to get formatted price
pricingPlanSchema.methods.getFormattedPrice = function () {
    const finalPrice = this.discount > 0
        ? this.price * (1 - this.discount / 100)
        : this.price;

    return {
        price: this.price,
        discount: this.discount,
        finalPrice: Math.round(finalPrice),
        savings: Math.round(this.price - finalPrice),
        currency: this.currency,
        billingCycle: this.billingCycle,
        isOneTime: this.isOneTime,
        contactSales: this.contactSales,
        planType: this.planType,
    };
};

// Static method to get active plans by type
pricingPlanSchema.statics.getActivePlansByType = function (planType) {
    const filter = { isActive: true };
    if (planType && ["individual", "team"].includes(planType)) {
        filter.planType = planType;
    }
    return this.find(filter).sort({ order: 1, name: 1 });
};

// Static method to get active plans
pricingPlanSchema.statics.getActivePlans = function () {
    return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

module.exports = { PricingPlan: mongoose.model("PricingPlan", pricingPlanSchema) };