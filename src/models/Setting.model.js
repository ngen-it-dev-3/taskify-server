// models/Setting.model.js
const mongoose = require("mongoose");

// ============================================================
// Password Policy Schema
// ============================================================
const passwordPolicySchema = new mongoose.Schema({
    minLength: {
        type: Number,
        default: 8,
        min: 4,
        max: 20,
    },
    requireUppercase: {
        type: Boolean,
        default: true,
    },
    requireLowercase: {
        type: Boolean,
        default: true,
    },
    requireNumbers: {
        type: Boolean,
        default: true,
    },
    requireSpecialChars: {
        type: Boolean,
        default: true,
    },
    expireDays: {
        type: Number,
        default: 90,
        min: 0,
    },
}, { _id: false });

// ============================================================
// Branding Images Schema - Stores Base64 Images
// ============================================================
const brandingImagesSchema = new mongoose.Schema({
    logo: {
        type: String,
        default: "",
        description: "Base64 encoded logo image (max 5MB)",
    },
    favicon: {
        type: String,
        default: "",
        description: "Base64 encoded favicon (max 1MB)",
    },
    loginBackground: {
        type: String,
        default: "",
        description: "Base64 encoded login page background (max 5MB)",
    },
    dashboardBanner: {
        type: String,
        default: "",
        description: "Base64 encoded dashboard banner (max 5MB)",
    },
    emailHeader: {
        type: String,
        default: "",
        description: "Base64 encoded email header image (max 2MB)",
    },
    emailFooter: {
        type: String,
        default: "",
        description: "Base64 encoded email footer image (max 2MB)",
    },
}, { _id: false });

// ============================================================
// Main Setting Schema
// ============================================================
const settingSchema = new mongoose.Schema({
    // ============================================================
    // General Settings
    // ============================================================
    systemName: {
        type: String,
        default: "Task Management System",
        trim: true,
    },
    systemLogo: {
        type: String,
        default: "",
        trim: true,
    },
    systemEmail: {
        type: String,
        default: "admin@example.com",
        trim: true,
        lowercase: true,
    },
    systemPhone: {
        type: String,
        default: "+1 (555) 000-0000",
        trim: true,
    },
    systemAddress: {
        type: String,
        default: "123 Main St, Suite 100, New York, NY 10001",
        trim: true,
    },

    // ============================================================
    // Branding Images - Base64 Storage
    // ============================================================
    brandingImages: {
        type: brandingImagesSchema,
        default: () => ({}),
    },

    // ============================================================
    // Time & Date Settings
    // ============================================================
    timezone: {
        type: String,
        default: "UTC",
        enum: [
            "UTC",
            "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
            "Europe/London", "Europe/Paris", "Europe/Berlin",
            "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Tokyo", "Asia/Shanghai",
            "Australia/Sydney", "Australia/Melbourne",
        ],
    },
    dateFormat: {
        type: String,
        default: "MM/DD/YYYY",
        enum: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMMM D, YYYY"],
    },
    timeFormat: {
        type: String,
        default: "12h",
        enum: ["12h", "24h"],
    },
    weekStartDay: {
        type: String,
        default: "Sunday",
        enum: ["Sunday", "Monday", "Saturday"],
    },
    currency: {
        type: String,
        default: "USD",
        enum: ["USD", "EUR", "GBP", "BDT", "INR", "CAD", "AUD", "JPY", "CNY", "EUR"],
    },
    currencySymbol: {
        type: String,
        default: "$",
        trim: true,
    },

    // ============================================================
    // Authentication Settings
    // ============================================================
    allowRegistration: {
        type: Boolean,
        default: true,
    },
    requireEmailVerification: {
        type: Boolean,
        default: true,
    },
    defaultRole: {
        type: String,
        default: "employee",
        enum: ["employee", "line_manager", "project_manager", "dept_manager", "hr_manager"],
    },
    sessionTimeout: {
        type: Number,
        default: 60,
        min: 5,
        max: 480,
    },
    maxLoginAttempts: {
        type: Number,
        default: 5,
        min: 1,
        max: 10,
    },
    lockoutDuration: {
        type: Number,
        default: 30,
        min: 5,
        max: 1440,
    },
    passwordPolicy: {
        type: passwordPolicySchema,
        default: () => ({}),
    },

    // ============================================================
    // Security Settings
    // ============================================================
    // Add to settingSchema (after passwordPolicy)

    // ============================================================
    // Security Settings (Add these fields)
    // ============================================================
    securityQuestions: {
        type: [String],
        default: [],
    },
    requireSecurityQuestions: {
        type: Boolean,
        default: false,
    },
    sessionConcurrency: {
        type: Boolean,
        default: false, // false = allow multiple sessions, true = single session only
    },
    rememberMeDuration: {
        type: Number,
        default: 30, // days
    },
    logoutOnPasswordChange: {
        type: Boolean,
        default: true,
    },
    autoLogoutInactive: {
        type: Boolean,
        default: true,
    },
    inactivityTimeout: {
        type: Number,
        default: 30, // minutes
    },
    passwordHistoryCount: {
        type: Number,
        default: 5,
    },
    enforcePasswordExpiry: {
        type: Boolean,
        default: false,
    },
    rateLimitEnabled: {
        type: Boolean,
        default: true,
    },
    rateLimitMaxRequests: {
        type: Number,
        default: 100,
    },
    rateLimitTimeWindow: {
        type: Number,
        default: 60, // seconds
    },
    mfaMethods: {
        type: [String],
        default: ["authenticator", "sms", "email"],
    },
    securityAlertsEnabled: {
        type: Boolean,
        default: true,
    },
    securityAlertEmail: {
        type: String,
        default: "",
    },

    twoFactorAuth: {
        type: Boolean,
        default: false,
    },
    ipWhitelist: {
        type: [String],
        default: [],
    },
    allowedDomains: {
        type: [String],
        default: [],
    },
    maintenanceMode: {
        type: Boolean,
        default: false,
    },
    maintenanceMessage: {
        type: String,
        default: "System is currently under maintenance. Please check back later.",
        trim: true,
    },

    // ============================================================
    // Notification Settings
    // ============================================================
    emailNotifications: {
        type: Boolean,
        default: true,
    },
    pushNotifications: {
        type: Boolean,
        default: true,
    },
    desktopNotifications: {
        type: Boolean,
        default: false,
    },
    notificationSound: {
        type: Boolean,
        default: true,
    },

    // ============================================================
    // Preference Settings
    // ============================================================
    language: {
        type: String,
        default: "en",
        enum: ["en", "es", "fr", "de", "zh", "ja", "bn", "ar", "pt", "ru"],
    },
    theme: {
        type: String,
        default: "system",
        enum: ["light", "dark", "system"],
    },
    sidebarCollapsed: {
        type: Boolean,
        default: false,
    },
    compactMode: {
        type: Boolean,
        default: false,
    },

    // ============================================================
    // Feature Settings
    // ============================================================
    enableKPIModule: {
        type: Boolean,
        default: true,
    },
    enableTimesheetModule: {
        type: Boolean,
        default: true,
    },
    enableLeaveModule: {
        type: Boolean,
        default: true,
    },
    enableChatModule: {
        type: Boolean,
        default: false,
    },
    enableReportingModule: {
        type: Boolean,
        default: true,
    },
    enableAIAssistant: {
        type: Boolean,
        default: false,
    },

    // ============================================================
    // Integration Settings
    // ============================================================
    enableSlackIntegration: {
        type: Boolean,
        default: false,
    },
    slackWebhookUrl: {
        type: String,
        default: "",
        trim: true,
    },
    enableDiscordIntegration: {
        type: Boolean,
        default: false,
    },
    discordWebhookUrl: {
        type: String,
        default: "",
        trim: true,
    },

    // ============================================================
    // Audit Fields
    // ============================================================
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
    versionKey: false,
});

// ============================================================
// Indexes
// ============================================================
settingSchema.index({ updatedAt: -1 });

// ============================================================
// Pre-save Middleware
// ============================================================
settingSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});

// ============================================================
// Methods
// ============================================================
settingSchema.methods.getPublicSettings = function () {
    const settings = this.toObject();
    delete settings._id;
    delete settings.__v;
    return settings;
};

// ============================================================
// Statics
// ============================================================
settingSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

settingSchema.statics.updateSettings = async function (updates, userId) {
    let settings = await this.findOne();
    if (!settings) {
        settings = new this(updates);
    } else {
        Object.assign(settings, updates);
    }
    settings.updatedBy = userId;
    settings.updatedAt = new Date();
    await settings.save();
    return settings;
};

module.exports = { Setting: mongoose.model("Setting", settingSchema) };