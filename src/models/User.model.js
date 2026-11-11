// models/User.model.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ============================================================
    // BASIC INFORMATION
    // ============================================================
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },

    // ============================================================
    // EMPLOYEE INFORMATION
    // ============================================================
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    role: {
      type: String,
      default: "tender_user",
      enum: [
        "super_admin",
        "admin",
        "hr_manager",
        "dept_manager",
        "project_manager",
        "line_manager",
        "employee",
        "tender_user",
      ],
    },
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: false,
      default: null,
      index: true,
      set: function (v) {
        if (v === "" || v === null || v === undefined) {
          return null;
        }
        return v;
      },
    },
    position: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },

    // ============================================================
    // PROFILE INFORMATION
    // ============================================================
    profilePhoto: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    website: {
      type: String,
      default: "",
    },
    companyName: {
      type: String,
      default: "",
    },
    jobTitle: {
      type: String,
      default: "",
    },

    // ============================================================
    // SKILLS & LANGUAGES
    // ============================================================
    skills: {
      type: [String],
      default: [],
    },
    languages: {
      type: [String],
      default: [],
    },

    // ============================================================
    // ACHIEVEMENTS
    // ============================================================
    achievements: {
      type: [
        {
          title: { type: String, required: true },
          date: { type: String, default: "" },
          description: { type: String, required: true },
        },
      ],
      default: [],
    },

    // ============================================================
    // SOCIAL LINKS
    // ============================================================
    socialLinks: {
      linkedin: { type: String, default: "" },
      github: { type: String, default: "" },
      twitter: { type: String, default: "" },
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
    },

    // ============================================================
    // PROFILE DETAILS (Nested)
    // ============================================================
    profile: {
      bio: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      dateOfBirth: { type: Date },
      gender: {
        type: String,
        enum: ["male", "female", "other", ""],
        default: "",
      },
      skills: [{ type: String }],
      socialLinks: {
        linkedin: { type: String, default: "" },
        github: { type: String, default: "" },
        twitter: { type: String, default: "" },
        website: { type: String, default: "" },
      },
    },

    // ============================================================
    // EMPLOYMENT DETAILS
    // ============================================================
    employment: {
      joiningDate: { type: Date },
      employmentType: {
        type: String,
        enum: ["full-time", "part-time", "contract", "intern", ""],
        default: "",
      },
      workLocation: {
        type: String,
        enum: ["on-site", "hybrid", "remote", ""],
        default: "",
      },
      manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reportsTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    // ============================================================
    // ACCOUNT STATUS
    // ============================================================
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPasswordChanged: {
      type: Boolean,
      default: false,
    },
    firstLogin: {
      type: Boolean,
      default: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    refreshToken: {
      type: String,
      select: false,
    },

    // ============================================================
    // PASSWORD RESET
    // ============================================================
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },

    // ============================================================
    // TRIAL & SUBSCRIPTION
    // ============================================================
    trial: {
      isActive: {
        type: Boolean,
        default: false,
      },
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
      daysLeft: {
        type: Number,
        default: 0,
      },
      plan: {
        type: String,
        default: "individual",
        enum: [
          "individual",
          "team",
          "starter",
          "pro",
          "business",
          "enterprise",
          "free",
        ],
      },
      billingCycle: {
        type: String,
        default: "monthly",
        enum: ["monthly", "yearly", "quarterly"],
      },
      price: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "USD",
      },
      period: {
        type: String,
        default: "month",
      },
    },

    subscription: {
      status: {
        type: String,
        enum: ["none", "trial", "active", "expired", "cancelled", "pending"],
        default: "none",
      },
      plan: {
        type: String,
        default: "free",
        enum: [
          "free",
          "individual",
          "team",
          "starter",
          "pro",
          "business",
          "enterprise",
        ],
      },
      billingCycle: {
        type: String,
        default: "monthly",
        enum: ["monthly", "yearly", "quarterly"],
      },
      price: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "USD",
      },
      startDate: {
        type: Date,
        default: null,
      },
      trialEndDate: {
        type: Date,
        default: null,
      },
      nextBillingDate: {
        type: Date,
        default: null,
      },
      cancelledAt: {
        type: Date,
        default: null,
      },
      paymentMethod: {
        type: String,
        default: "",
      },
      paymentProvider: {
        type: String,
        default: "",
      },
      paymentId: {
        type: String,
        default: "",
      },
    },

    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    mustChangePassword: { type: Boolean, default: false },
    trialStartsAt: { type: Date, default: null },   // ✅ ADD THIS
    trialEndsAt: { type: Date, default: null },


    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      desktop: { type: Boolean, default: false },
      taskReminder: { type: Boolean, default: true },
      deadlineAlert: { type: Boolean, default: true },
      teamUpdate: { type: Boolean, default: true },
      taskUpdates: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: true },
      systemUpdates: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },

    // ============================================================
    // SETTINGS
    // ============================================================
    settings: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
      },
      dateFormat: {
        type: String,
        default: "MM/DD/YYYY",
      },
      sidebarCollapsed: {
        type: Boolean,
        default: false,
      },
      compactMode: {
        type: Boolean,
        default: false,
      },
    },
    // ============================================================
    // CREDENTIAL ACCESS (NEW)
    // ============================================================
    hasCredentialAccess: {
      type: Boolean,
      default: false,
      index: true,
    },
    credentialAccessGrantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    credentialAccessGrantedAt: {
      type: Date,
      default: null,
    },
    // ============================================================
    // CRM ACCESS RULES
    // ============================================================
    crmAccess: {
      lists: {
        served: { type: Boolean, default: true },
        notAttended: { type: Boolean, default: true },
        potential: { type: Boolean, default: true },
      },
      canSeePayments: { type: Boolean, default: false },
      canSeeNotes: { type: Boolean, default: false },
      canEdit: { type: Boolean, default: false },
      scope: { type: String, enum: ["all", "assigned"], default: "all" },
      assignedTo: { type: String, default: "" }, // If scope is "assigned"
    },

    // ============================================================
    // TIMESTAMPS
    // ============================================================
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES
// NOTE: `email` and `employeeId` already have `unique: true` on their
// field definitions, which creates those indexes. Do NOT declare them
// again here — that would trigger a "Duplicate schema index" warning.
// ============================================================
userSchema.index({ roles: 1 });
userSchema.index({ department: 1 });
userSchema.index({ "employment.manager": 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ "trial.isActive": 1 });
userSchema.index({ "subscription.status": 1 });
userSchema.index({ "trial.endDate": 1 });

// ============================================================
// PRE-SAVE MIDDLEWARE
// ============================================================
userSchema.pre("save", async function (next) {
  // Only hash if password is modified
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================================
// INSTANCE METHODS
// ============================================================

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get role names
userSchema.methods.getRoleNames = async function () {
  if (this.roles && this.roles.length > 0) {
    await this.populate("roles");
    return this.roles.map((r) => r.name);
  }
  return [this.role];
};

// Get primary role
userSchema.methods.getPrimaryRole = async function () {
  if (this.roles && this.roles.length > 0) {
    await this.populate("roles");
    const primaryRole = this.roles.find(
      (r) => r.code.toLowerCase() === this.role
    );
    return primaryRole ? primaryRole.name : this.role;
  }
  return this.role;
};

// Check if user has a specific role
userSchema.methods.hasRole = function (roleCode) {
  if (this.role === roleCode) return true;
  if (this.roles && this.roles.length > 0) {
    if (typeof this.roles[0] === "object" && this.roles[0].code) {
      return this.roles.some(
        (r) => r.code.toLowerCase() === roleCode.toLowerCase()
      );
    }
  }
  return false;
};

// Check if user has any of the given roles
userSchema.methods.hasAnyRole = function (roleCodes) {
  return roleCodes.some((code) => this.hasRole(code));
};

// ============================================================
// TRIAL & SUBSCRIPTION METHODS
// ============================================================

// Check if user is on trial
userSchema.methods.isOnTrial = function () {
  if (!this.trial || !this.trial.isActive) return false;
  const now = new Date();
  const endDate = new Date(this.trial.endDate);
  return now < endDate;
};

// Get days left in trial
userSchema.methods.getTrialDaysLeft = function () {
  if (!this.isOnTrial()) return 0;
  const now = new Date();
  const endDate = new Date(this.trial.endDate);
  const diffTime = endDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Check if subscription is active
userSchema.methods.isSubscriptionActive = function () {
  return this.subscription && this.subscription.status === "active";
};

// Check if subscription is on trial
userSchema.methods.isSubscriptionOnTrial = function () {
  return this.subscription && this.subscription.status === "trial";
};

// Get subscription status
userSchema.methods.getSubscriptionStatus = function () {
  if (this.isOnTrial()) return "trial";
  if (this.isSubscriptionActive()) return "active";
  if (this.subscription?.status === "expired") return "expired";
  if (this.subscription?.status === "cancelled") return "cancelled";
  return "none";
};

// Start trial for user
userSchema.methods.startTrial = function (plan = "individual", days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  this.trial = {
    isActive: true,
    startDate: startDate,
    endDate: endDate,
    daysLeft: days,
    plan: plan,
    billingCycle: "monthly",
    price: this.getPlanPrice(plan),
    currency: "USD",
    period: "month",
  };

  this.subscription = {
    status: "trial",
    plan: plan,
    billingCycle: "monthly",
    price: this.getPlanPrice(plan),
    currency: "USD",
    startDate: startDate,
    trialEndDate: endDate,
    nextBillingDate: null,
    cancelledAt: null,
    paymentMethod: "",
    paymentProvider: "",
    paymentId: "",
  };

  return this;
};

// Get plan price helper
userSchema.methods.getPlanPrice = function (plan) {
  const prices = {
    individual: 10,
    team: 29,
    starter: 10,
    pro: 29,
    business: 49,
    enterprise: 99,
    free: 0,
  };
  return prices[plan] || 0;
};

// End trial
userSchema.methods.endTrial = function () {
  if (this.trial) {
    this.trial.isActive = false;
    this.trial.daysLeft = 0;
  }
  if (this.subscription && this.subscription.status === "trial") {
    this.subscription.status = "expired";
  }
  return this;
};

// Activate subscription
userSchema.methods.activateSubscription = function (plan = "enterprise") {
  const price = this.getPlanPrice(plan);
  this.subscription = {
    status: "active",
    plan: plan,
    billingCycle: "monthly",
    price: price,
    currency: "USD",
    startDate: new Date(),
    trialEndDate: null,
    nextBillingDate: null,
    cancelledAt: null,
    paymentMethod: "",
    paymentProvider: "",
    paymentId: "",
  };
  return this;
};

// Cancel subscription
userSchema.methods.cancelSubscription = function () {
  if (this.subscription) {
    this.subscription.status = "cancelled";
    this.subscription.cancelledAt = new Date();
  }
  return this;
};

// ============================================================
// STATIC METHODS
// ============================================================

// Find users with expiring trials
userSchema.statics.findExpiringTrials = function (days = 1) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return this.find({
    "trial.isActive": true,
    "trial.endDate": { $gte: now, $lte: future },
  });
};

// Find users whose trials have expired
userSchema.statics.findExpiredTrials = function () {
  const now = new Date();
  return this.find({
    "trial.isActive": true,
    "trial.endDate": { $lt: now },
  });
};

// Find users by subscription status
userSchema.statics.findBySubscriptionStatus = function (status) {
  return this.find({ "subscription.status": status });
};

// Get users with active trials
userSchema.statics.getActiveTrials = function () {
  const now = new Date();
  return this.find({
    "trial.isActive": true,
    "trial.endDate": { $gt: now },
  });
};

// ============================================================
// VIRTUAL PROPERTIES
// ============================================================

// Full name with employee ID
userSchema.virtual("displayName").get(function () {
  return `${this.fullName} (${this.employeeId || "No ID"})`;
});

// Trial status text
userSchema.virtual("trialStatus").get(function () {
  if (this.isOnTrial()) {
    const daysLeft = this.getTrialDaysLeft();
    return `Trial - ${daysLeft} days remaining`;
  }
  if (this.subscription?.status === "active") return "Active Subscription";
  if (this.subscription?.status === "expired") return "Expired";
  if (this.subscription?.status === "cancelled") return "Cancelled";
  return "No Subscription";
});

// ============================================================
// JSON TRANSFORM
// ============================================================
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

userSchema.set("toObject", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

// ============================================================
// EXPORT
// ============================================================
module.exports = { User: mongoose.model("User", userSchema) };