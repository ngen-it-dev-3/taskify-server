// controllers/auth.controller.js
// ============================================================
// COMPLETE AUTH CONTROLLER - FULLY FUNCTIONAL
// ============================================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models/User.model");
const { Project } = require("../models/Project.model");
const { Role } = require("../models/Role.model");
const crypto = require("crypto");
const { sendEmail } = require("../config/email.config");
const EmailTemplates = require("../services/emailTemplates.service");
const { createAuditLog } = require("./auditLog.controller");

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.resetPasswordToken;
  delete userObj.resetPasswordExpires;
  delete userObj.refreshToken;
  return userObj;
};

const ensureProfilePhoto = (userObj) => {
  if (!userObj.profilePhoto && userObj.avatar) {
    userObj.profilePhoto = userObj.avatar;
  }
  return userObj;
};

// ============================================================
// GET ACTIVE USERS
// ============================================================
const getActiveUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level")
      .sort({ role: 1, fullName: 1 });

    const formattedUsers = users.map((user) => {
      const userObj = user.toObject();
      return {
        _id: userObj._id,
        id: userObj._id,
        fullName: userObj.fullName,
        email: userObj.email,
        role: userObj.role,
        employeeId: userObj.employeeId,
        department: userObj.department,
        roles: userObj.roles || [],
        isActive: userObj.isActive,
        profilePhoto: userObj.profilePhoto || userObj.avatar || null,
        badge:
          userObj.role === "super_admin"
            ? "Full Access"
            : userObj.role === "admin"
              ? "Management"
              : userObj.role === "hr_manager"
                ? "HR Panel"
                : userObj.role === "dept_manager"
                  ? "Team Lead"
                  : userObj.role === "project_manager"
                    ? "Project Lead"
                    : userObj.role === "line_manager"
                      ? "Line Manager"
                      : "Staff Access",
      };
    });

    res.json({
      success: true,
      data: formattedUsers,
      count: formattedUsers.length,
    });
  } catch (error) {
    console.error("Get active users error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// LOGIN
// ============================================================
// controllers/auth.controller.js - Fix login function

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // ✅ Make sure to select the password field
    const user = await User.findOne({ email: email.toLowerCase() })
      .select("+password") // ✅ This is important
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      // Log failed login attempt
      await createAuditLog({
        action: "login",
        resource: "user",
        userId: null,
        user: {
          id: null,
          name: "Unknown",
          email: email,
          role: "unknown",
        },
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"] || "Unknown",
        details: {
          method: "POST",
          path: "/auth/login",
          status: "failed",
          reason: "User not found"
        },
        status: "failed",
        severity: "medium",
        metadata: {
          browser: req.headers["user-agent"] || "Unknown",
          os: "Unknown",
          platform: "Unknown"
        }
      });

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated. Please contact administrator.",
      });
    }

    console.log("👤 User found:", user.email);
    console.log("🔐 Stored password hash:", user.password ? "Exists" : "Missing");

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log("✅ Password valid:", isPasswordValid);

    if (!isPasswordValid) {
      // Log failed login attempt
      await createAuditLog({
        action: "login",
        resource: "user",
        resourceId: user._id,
        userId: user._id,
        user: {
          id: user._id,
          name: user.fullName || user.name,
          email: user.email,
          role: user.role,
        },
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"] || "Unknown",
        details: {
          method: "POST",
          path: "/auth/login",
          status: "failed",
          reason: "Invalid password"
        },
        status: "failed",
        severity: "medium",
        metadata: {
          browser: req.headers["user-agent"] || "Unknown",
          os: "Unknown",
          platform: "Unknown"
        }
      });

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ Successful login - update last login
    user.lastLogin = new Date();
    await user.save();

    // Log successful login
    await createAuditLog({
      action: "login",
      resource: "user",
      resourceId: user._id,
      userId: user._id,
      user: {
        id: user._id,
        name: user.fullName || user.name,
        email: user.email,
        role: user.role,
      },
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"] || "Unknown",
      details: {
        method: "POST",
        path: "/auth/login",
        status: "success",
        lastLogin: user.lastLogin
      },
      status: "success",
      severity: "low",
      metadata: {
        browser: req.headers["user-agent"] || "Unknown",
        os: "Unknown",
        platform: "Unknown"
      }
    });

    const token = generateToken(user);
    let userResponse = sanitizeUser(user);
    userResponse = ensureProfilePhoto(userResponse);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: userResponse,
        accessToken: token,
        token,
        firstLogin: user.firstLogin === true,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    // Log error
    await createAuditLog({
      action: "login",
      resource: "user",
      userId: null,
      user: {
        id: null,
        name: "Unknown",
        email: req.body?.email || "Unknown",
        role: "unknown",
      },
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"] || "Unknown",
      details: {
        method: "POST",
        path: "/auth/login",
        status: "error",
        error: error.message
      },
      status: "failed",
      severity: "high",
      metadata: {
        browser: req.headers["user-agent"] || "Unknown",
        os: "Unknown",
        platform: "Unknown"
      }
    }).catch(err => console.error("Failed to log login error:", err));

    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// LOGOUT
// ============================================================
const logout = async (req, res) => {
  try {
    // Log logout first (before sending response)
    await createAuditLog({
      action: "logout",
      resource: "user",
      resourceId: req.user?._id,
      userId: req.user?._id,
      user: {
        id: req.user?._id,
        name: req.user?.fullName || req.user?.name || "Unknown",
        email: req.user?.email || "Unknown",
        role: req.user?.role || "unknown",
      },
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"] || "Unknown",
      details: {
        method: "POST",
        path: "/auth/logout",
        status: "success"
      },
      status: "success",
      severity: "low",
      metadata: {
        browser: req.headers["user-agent"] || "Unknown",
        os: "Unknown",
        platform: "Unknown"
      }
    }).catch(err => console.error("Failed to log logout:", err));

    // Then send response
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// REFRESH TOKEN
// ============================================================
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .populate("department", "name code")
        .populate("roles", "name code level");

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: "User not found or inactive",
        });
      }

      const newToken = generateToken(user);

      res.json({
        success: true,
        data: { accessToken: newToken, token: newToken },
      });
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// GET CURRENT USER
// ============================================================
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      data: userObj,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// controllers/auth.controller.js - Updated register function

// controllers/auth.controller.js - Fixed register function

const register = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      companyName,
      jobTitle,
      plan,
      billingCycle,
      price,
      currency,
      period,
      trialDays = 7,
      isAdminCreation = false,
      role,
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Check phone if provided
    if (phone && phone.trim()) {
      const existingPhone = await User.findOne({ phoneNumber: phone.trim() });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "User with this phone number already exists",
          field: "phone",
          value: phone,
        });
      }
    }

    // Get default role
    let userRole = role || "employee";
    let roleId = null;
    const defaultRole = await Role.findOne({ code: "EMPLOYEE" });
    if (defaultRole) {
      roleId = defaultRole._id;
    }

    const employeeId = `EMP${Date.now().toString().slice(-6)}`;
    let trialEndDate = null;

    const userData = {
      fullName,
      email: email.toLowerCase(),
      password,
      employeeId,
      phoneNumber: phone || null,
      companyName: companyName || null,
      jobTitle: jobTitle || null,
      role: userRole,
      roles: roleId ? [roleId] : [],
      isActive: true,
      isEmailVerified: false,
      firstLogin: true,
    };

    if (!isAdminCreation) {
      trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + (trialDays || 7));

      userData.trial = {
        isActive: true,
        startDate: new Date(),
        endDate: trialEndDate,
        daysLeft: trialDays || 7,
        plan: plan || "individual",
        billingCycle: billingCycle || "monthly",
        price: price || 0,
        currency: currency || "USD",
        period: period || "month",
      };

      userData.subscription = {
        status: "trial",
        plan: plan || "individual",
        billingCycle: billingCycle || "monthly",
        price: price || 0,
        currency: currency || "USD",
        startDate: new Date(),
        trialEndDate: trialEndDate,
      };
    }

    const user = await User.create(userData);

    // ✅ Send response FIRST (before email/audit logs)
    const userResponse = sanitizeUser(user);
    const responseData = { user: userResponse };

    if (!isAdminCreation) {
      responseData.trial = {
        isActive: true,
        daysLeft: trialDays || 7,
        endDate: trialEndDate,
      };
      responseData.message = `Account created successfully! Your ${trialDays || 7}-day free trial has started.`;
    } else {
      responseData.message = "User created successfully by admin.";
    }

    // ✅ Send response immediately
    res.status(201).json({
      success: true,
      message: responseData.message,
      data: responseData,
    });

    // ✅ Do background tasks AFTER response (don't block)
    setImmediate(async () => {
      try {
        // Send email in background
        if (!isAdminCreation) {
          await sendTrialWelcomeEmail(user, password, trialDays || 7, trialEndDate, plan);
        } else {
          await sendAdminCreatedWelcomeEmail(user, password);
        }
      } catch (emailError) {
        console.error('⚠️ Background email failed:', emailError.message);
      }

      // Create audit log in background
      try {
        await createAuditLog({
          action: isAdminCreation ? "admin_create_user" : "register",
          resource: "user",
          resourceId: user._id,
          userId: user._id,
          user: {
            id: user._id,
            name: user.fullName,
            email: user.email,
            role: user.role,
          },
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.headers["user-agent"] || "Unknown",
          details: {
            method: "POST",
            path: "/auth/register",
            status: "success",
            isAdminCreation: isAdminCreation,
            plan: plan || "individual",
            trialDays: isAdminCreation ? 0 : (trialDays || 7),
          },
          status: "success",
          severity: "low",
        });
      } catch (auditError) {
        console.error('⚠️ Background audit log failed:', auditError.message);
      }
    });

  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// ADMIN CREATE USER (No trial) - FIXED
// ============================================================

const adminCreateUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      role,
      department,
      employeeId,
      profilePhoto,
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Get role
    let userRole = role || "employee";
    let roleId = null;

    if (role) {
      const roleDoc = await Role.findOne({ code: role.toUpperCase() });
      if (roleDoc) {
        roleId = roleDoc._id;
      }
    } else {
      const defaultRole = await Role.findOne({ code: "EMPLOYEE" });
      if (defaultRole) {
        roleId = defaultRole._id;
      }
    }

    const finalEmployeeId = employeeId || `EMP${Date.now().toString().slice(-6)}`;

    // Admin creates user - NO trial, active immediately
    const userData = {
      fullName,
      email: email.toLowerCase(),
      password,
      employeeId: finalEmployeeId,
      role: userRole,
      roles: roleId ? [roleId] : [],
      department: department || null,
      phoneNumber: phoneNumber || null,
      isActive: true,
      isEmailVerified: true,
      firstLogin: true,
      subscription: {
        status: "active",
        plan: "enterprise",
        billingCycle: "monthly",
        price: 0,
        currency: "USD",
        startDate: new Date(),
      },
    };

    if (profilePhoto) {
      userData.profilePhoto = profilePhoto;
      userData.avatar = profilePhoto;
    }

    const user = await User.create(userData);

    // ✅ STEP 1: Send response IMMEDIATELY (before email/audit logs)
    const userResponse = sanitizeUser(user);

    console.log(`✅ User created: ${user.email}`);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { user: userResponse },
    });

    // ✅ STEP 2: Do background tasks AFTER response
    setImmediate(async () => {
      // Send welcome email in background
      try {
        if (user && user.email) {
          await sendAdminCreatedWelcomeEmail(user, password);
          console.log(`✅ Welcome email sent to ${user.email}`);
        } else {
          console.log('⚠️ Skipping email - no user email found');
        }
      } catch (emailError) {
        console.error('⚠️ Background email failed:', emailError.message);
      }

      // Create audit log in background
      try {
        await createAuditLog({
          action: "admin_create_user",
          resource: "user",
          resourceId: user._id,
          userId: req.user?._id || null,
          user: req.user ? {
            id: req.user._id,
            name: req.user.fullName || req.user.name,
            email: req.user.email,
            role: req.user.role,
          } : {
            id: null,
            name: "System",
            email: "system@example.com",
            role: "system",
          },
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.headers["user-agent"] || "Unknown",
          details: {
            method: "POST",
            path: "/auth/admin/create-user",
            status: "success",
            createdUser: user.email,
          },
          status: "success",
          severity: "low",
        });
        console.log(`✅ Audit log created for ${user.email}`);
      } catch (auditError) {
        console.error('⚠️ Background audit log failed:', auditError.message);
      }

      // Update department employee count in background
      if (department) {
        try {
          const { Department } = require("../models/Department.model");
          const dept = await Department.findById(department);
          if (dept) {
            await dept.updateEmployeeCount();
            console.log(`✅ Department count updated for ${dept.name}`);
          }
        } catch (deptError) {
          console.error('⚠️ Background department update failed:', deptError.message);
        }
      }
    });

  } catch (error) {
    console.error("Admin create user error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
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

// controllers/auth.controller.js - Add this function if missing

// ============================================================
// SEND TRIAL WELCOME EMAIL
// ============================================================
const sendTrialWelcomeEmail = async (user, tempPassword, trialDays, trialEndDate, plan) => {
  try {
    // ✅ Validate user and email
    if (!user || !user.email) {
      console.error('❌ Cannot send trial email: User or email missing');
      return { success: false, message: 'User or email missing' };
    }

    const planNames = {
      individual: "Individual",
      team: "Team",
      starter: "Starter",
      pro: "Pro",
      business: "Business",
      enterprise: "Enterprise",
    };

    const planName = planNames[plan] || "Individual";

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TaskFlow - Your ${trialDays}-Day Free Trial</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff; }
          .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #0f2444, #1a365d); border-radius: 12px 12px 0 0; }
          .header h1 { color: #ffffff; font-size: 28px; margin: 0; font-weight: 700; }
          .header p { color: #94a3b8; margin: 10px 0 0; }
          .content { padding: 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .trial-box { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1px solid #6ee7b7; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .trial-box h2 { color: #065f46; margin: 0; font-size: 24px; }
          .trial-box p { color: #047857; margin: 5px 0; }
          .btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 14px; }
          .credentials { background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 10px 0; }
          .credentials code { background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Welcome to TaskFlow!</h1>
            <p>Your ${trialDays}-Day Free Trial Starts Now</p>
          </div>
          <div class="content">
            <h2>Hi ${user.fullName}!</h2>
            <p>Thank you for signing up for TaskFlow. We're excited to help you manage your tasks more efficiently.</p>
            
            <div class="trial-box">
              <h2>🎉 ${trialDays}-Day Free Trial</h2>
              <p><strong>${planName}</strong> Plan - ${trialDays} days free</p>
              <p>Your trial ends on: <strong>${new Date(trialEndDate).toLocaleDateString()}</strong></p>
            </div>

            <h3>Your Account Details:</h3>
            <div class="credentials">
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Password:</strong> <code>${tempPassword}</code></p>
              <p style="font-size: 12px; color: #94a3b8;">We recommend changing your password after first login.</p>
            </div>

            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">Login to Get Started</a>
            </div>

            <h3>What's included in your trial:</h3>
            <ul style="color: #475569; line-height: 1.8;">
              <li>✓ Full access to all ${planName} features</li>
              <li>✓ Unlimited tasks and projects</li>
              <li>✓ Team collaboration tools</li>
              <li>✓ Priority email support</li>
              <li>✓ No credit card required</li>
            </ul>

            <p style="color: #475569;">Your trial will automatically end after ${trialDays} days. You'll receive a reminder before it expires.</p>

            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; margin: 0; font-size: 14px;">
                <strong>💡 Tip:</strong> Complete your profile and invite team members to get the most out of your trial.
              </p>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} TaskFlow. All rights reserved.</p>
            <p style="font-size: 12px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/privacy" style="color: #10b981;">Privacy Policy</a> | 
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/terms" style="color: #10b981;">Terms of Service</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendEmail({
      to: user.email,
      subject: `🎉 Welcome to TaskFlow! Your ${trialDays}-Day Free Trial`,
      html: emailHTML,
    });

    if (result && result.success) {
      console.log(`✅ Trial welcome email sent to ${user.email}`);
      return { success: true };
    } else {
      console.error(`❌ Failed to send trial email to ${user.email}:`, result?.error || 'Unknown error');
      return { success: false, error: result?.error || 'Unknown error' };
    }
  } catch (error) {
    console.error("Error sending trial email:", error);
    return { success: false, error: error.message };
  }
};

// controllers/auth.controller.js - Add this function if missing

// ============================================================
// SEND ADMIN CREATED WELCOME EMAIL (No trial)
// ============================================================
const sendAdminCreatedWelcomeEmail = async (user, tempPassword) => {
  try {
    // ✅ Validate user and email
    if (!user || !user.email) {
      console.error('❌ Cannot send email: User or email missing');
      return { success: false, message: 'User or email missing' };
    }

    console.log(`📧 Preparing welcome email for: ${user.email}`);

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to TaskFlow</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff; }
          .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #0f2444, #1a365d); border-radius: 12px 12px 0 0; }
          .header h1 { color: #ffffff; font-size: 28px; margin: 0; font-weight: 700; }
          .content { padding: 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; }
          .btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 14px; }
          .credentials { background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 10px 0; }
          .credentials code { background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Welcome to TaskFlow!</h1>
            <p>Your account has been created</p>
          </div>
          <div class="content">
            <h2>Hi ${user.fullName || 'User'}!</h2>
            <p>An administrator has created your TaskFlow account. You're ready to start managing your tasks!</p>

            <h3>Your Account Details:</h3>
            <div class="credentials">
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Password:</strong> <code>${tempPassword || 'Please contact your administrator'}</code></p>
              <p style="font-size: 12px; color: #94a3b8;">We recommend changing your password after first login.</p>
            </div>

            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">Login to Get Started</a>
            </div>

            <p style="color: #475569; margin-top: 20px;">If you have any questions, please contact your administrator.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} TaskFlow. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // ✅ Send email with proper validation
    const result = await sendEmail({
      to: user.email,
      subject: "🚀 Welcome to TaskFlow - Your Account is Ready",
      html: emailHTML,
    });

    if (result && result.success) {
      console.log(`✅ Admin created welcome email sent to ${user.email}`);
      return { success: true };
    } else {
      console.error(`❌ Failed to send email to ${user.email}:`, result?.error || 'Unknown error');
      return { success: false, error: result?.error || 'Unknown error' };
    }
  } catch (error) {
    console.error("Error sending admin welcome email:", error);
    return { success: false, error: error.message };
  }
};
// ============================================================
// GET ALL USERS
// ============================================================
// const getAllUsers = async (req, res) => {
//   try {
//     const user = req.user;
//     let query = {};

//     // ========== ROLE-BASED FILTERING ==========
//     if (
//       user.role === "super_admin" ||
//       user.role === "admin" ||
//       user.role === "hr_manager"
//     ) {
//       // Can see all users
//     } else if (user.role === "dept_manager") {
//       if (user.department) {
//         query.department = user.department;
//       } else {
//         return res.json({
//           success: true,
//           data: [],
//           pagination: { page: 1, limit: 100, total: 0, pages: 0 },
//         });
//       }
//     } else if (user.role === "project_manager") {
//       const projects = await Project.find({
//         projectManager: user._id,
//       }).select("teamMembers");

//       const teamMemberIds = projects.flatMap(
//         (p) => p.teamMembers?.map((m) => m.userId) || [],
//       );
//       teamMemberIds.push(user._id);

//       if (teamMemberIds.length > 0) {
//         query._id = { $in: teamMemberIds };
//       } else {
//         return res.json({
//           success: true,
//           data: [],
//           pagination: { page: 1, limit: 100, total: 0, pages: 0 },
//         });
//       }
//     } else if (user.role === "line_manager") {
//       const teamMembers = await User.find({ managerId: user._id }).select("_id");
//       const memberIds = teamMembers.map((m) => m._id);
//       memberIds.push(user._id);

//       if (memberIds.length > 0) {
//         query._id = { $in: memberIds };
//       } else {
//         return res.json({
//           success: true,
//           data: [],
//           pagination: { page: 1, limit: 100, total: 0, pages: 0 },
//         });
//       }
//     } else {
//       query._id = user._id;
//     }

//     // Additional filters
//     if (
//       req.query.department &&
//       (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager")
//     ) {
//       query.department = req.query.department;
//     }

//     if (
//       req.query.role &&
//       (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager")
//     ) {
//       query.role = req.query.role;
//     }

//     if (req.query.search) {
//       const searchRegex = new RegExp(req.query.search, "i");
//       query.$or = [
//         { fullName: searchRegex },
//         { email: searchRegex },
//         { employeeId: searchRegex },
//       ];
//     }

//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 100;
//     const skip = (page - 1) * limit;

//     const users = await User.find(query)
//       .select("-password")
//       .populate("department", "name code")
//       .populate("roles", "name code level")
//       .populate("employment.manager", "fullName email")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     const total = await User.countDocuments(query);

//     const usersWithPhoto = users.map((u) => {
//       const obj = u.toObject();
//       return ensureProfilePhoto(obj);
//     });

//     res.json({
//       success: true,
//       data: usersWithPhoto,
//       pagination: {
//         page,
//         limit,
//         total,
//         pages: Math.ceil(total / limit),
//       },
//     });
//   } catch (error) {
//     console.error("Get all users error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error: " + error.message,
//     });
//   }
// };

// ============================================================
// GET ALL USERS
// ============================================================
const getAllUsers = async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // ========== ROLE-BASED FILTERING ==========
    if (
      user.role === "super_admin" ||
      user.role === "admin" ||
      user.role === "hr_manager"
    ) {
      // Can see all users
    } else if (user.role === "dept_manager") {
      if (user.department) {
        query.department = user.department;
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { page: 1, limit: 100, total: 0, pages: 0 },
        });
      }
    } else if (user.role === "project_manager") {
      const projects = await Project.find({
        projectManager: user._id,
      }).select("teamMembers");

      const teamMemberIds = projects.flatMap(
        (p) => p.teamMembers?.map((m) => m.userId) || [],
      );
      teamMemberIds.push(user._id);

      if (teamMemberIds.length > 0) {
        query._id = { $in: teamMemberIds };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { page: 1, limit: 100, total: 0, pages: 0 },
        });
      }
    } else if (user.role === "line_manager") {
      const teamMembers = await User.find({ managerId: user._id }).select("_id");
      const memberIds = teamMembers.map((m) => m._id);
      memberIds.push(user._id);

      if (memberIds.length > 0) {
        query._id = { $in: memberIds };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { page: 1, limit: 100, total: 0, pages: 0 },
        });
      }
    } else {
      // ✅ FIX: Allow employees to see all users (for chat)
      // Remove the restriction: query._id = user._id;
      // No filter - they can see all active users
    }

    // Additional filters
    if (
      req.query.department &&
      (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager")
    ) {
      query.department = req.query.department;
    }

    if (
      req.query.role &&
      (user.role === "super_admin" || user.role === "admin" || user.role === "hr_manager")
    ) {
      query.role = req.query.role;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { employeeId: searchRegex },
      ];
    }

    // ✅ Only show active users
    query.isActive = true;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level")
      .populate("employment.manager", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    const usersWithPhoto = users.map((u) => {
      const obj = u.toObject();
      return ensureProfilePhoto(obj);
    });

    res.json({
      success: true,
      data: usersWithPhoto,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};


// ============================================================
// GET USER PROFILE BY ID
// ============================================================
const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      data: userObj,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// UPDATE USER (Admin only)
// ============================================================
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phoneNumber, role, isActive, department, employeeId } = req.body;

    const currentUser = await User.findById(id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const oldDepartment = currentUser.department?.toString();

    if (req.body.roles) {
      const roleDoc = await Role.findById(req.body.roles[0]);
      if (roleDoc) {
        req.body.role = roleDoc.code.toLowerCase();
      }
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        fullName,
        phoneNumber,
        role,
        isActive,
        department,
        employeeId,
        ...(req.body.roles && { roles: req.body.roles }),
      },
      { new: true, runValidators: true },
    )
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (department && department !== oldDepartment) {
      const { Department } = require("../models/Department.model");
      if (oldDepartment) {
        const oldDept = await Department.findById(oldDepartment);
        if (oldDept) {
          await oldDept.updateEmployeeCount();
        }
      }
      if (department) {
        const newDept = await Department.findById(department);
        if (newDept) {
          await newDept.updateEmployeeCount();
        }
      }
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      message: "User updated successfully",
      data: userObj,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// DELETE USER (Super Admin only)
// ============================================================
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const department = user.department;

    await User.findByIdAndDelete(id);

    if (department) {
      const { Department } = require("../models/Department.model");
      const dept = await Department.findById(department);
      if (dept) {
        await dept.updateEmployeeCount();
      }
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// CHANGE USER ROLE (Super Admin only)
// ============================================================
const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = [
      "super_admin",
      "admin",
      "dept_manager",
      "project_manager",
      "line_manager",
      "employee",
      "hr_manager",
    ];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be one of: " + validRoles.join(", "),
      });
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true })
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      message: "User role updated successfully",
      data: userObj,
    });
  } catch (error) {
    console.error("Change role error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// CHANGE PASSWORD
// ============================================================
const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// controllers/auth.controller.js - updateMyProfile function

const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      fullName,
      phoneNumber,
      employeeId,
      department,
      bio,
      position,
      location,
      website,
      socialLinks,
      address,
      emergencyContact,
      skills,
      languages,
      achievements,
      notificationPreferences,
      dailyHoursTarget,
      profilePhoto,
    } = req.body;

    const updates = {};

    if (fullName !== undefined) updates.fullName = fullName;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (employeeId !== undefined) updates.employeeId = employeeId;
    if (department !== undefined) updates.department = department;
    if (bio !== undefined) updates.bio = bio;
    if (position !== undefined) updates.position = position;
    if (location !== undefined) updates.location = location;
    if (website !== undefined) updates.website = website;
    if (address !== undefined) updates.address = address;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (dailyHoursTarget !== undefined) updates.dailyHoursTarget = dailyHoursTarget;

    // ✅ Handle socialLinks - ensure it's an object
    if (socialLinks !== undefined) {
      if (typeof socialLinks === 'object' && !Array.isArray(socialLinks)) {
        updates.socialLinks = socialLinks;
      } else if (Array.isArray(socialLinks)) {
        // If it's an array, convert to object with empty strings
        const socialObj = {};
        const platforms = ['linkedin', 'github', 'twitter', 'facebook', 'instagram'];
        socialLinks.forEach(key => {
          if (platforms.includes(key)) {
            socialObj[key] = '';
          }
        });
        updates.socialLinks = socialObj;
      } else {
        updates.socialLinks = {};
      }
    }

    // ✅ Handle skills - ensure it's an array
    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        updates.skills = skills.filter(s => typeof s === 'string' && s.trim());
      } else {
        updates.skills = [];
      }
    }

    // ✅ Handle languages - ensure it's an array
    if (languages !== undefined) {
      if (Array.isArray(languages)) {
        updates.languages = languages.filter(l => typeof l === 'string' && l.trim());
      } else {
        updates.languages = [];
      }
    }

    // ✅ Handle achievements - ensure it's an array of objects
    if (achievements !== undefined) {
      if (Array.isArray(achievements)) {
        updates.achievements = achievements.filter(a =>
          typeof a === 'object' && a.title && a.description
        );
      } else {
        updates.achievements = [];
      }
    }

    // ✅ Handle notificationPreferences - ensure all fields exist
    if (notificationPreferences !== undefined) {
      updates.notificationPreferences = {
        email: notificationPreferences.email ?? true,
        push: notificationPreferences.push ?? true,
        desktop: notificationPreferences.desktop ?? false,
        taskReminder: notificationPreferences.taskReminder ?? true,
        deadlineAlert: notificationPreferences.deadlineAlert ?? true,
        teamUpdate: notificationPreferences.teamUpdate ?? true,
      };
    }

    // ✅ Handle profilePhoto - validate base64
    if (profilePhoto !== undefined) {
      if (profilePhoto && !profilePhoto.startsWith('data:image/')) {
        return res.status(400).json({
          success: false,
          message: "Invalid image format. Must be base64 data URL.",
        });
      }
      updates.profilePhoto = profilePhoto;
      updates.avatar = profilePhoto;
    }

    // Remove undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    console.log("📝 Applying updates:", Object.keys(updates));
    console.log("📝 Skills:", updates.skills);
    console.log("📝 Languages:", updates.languages);
    console.log("📝 Achievements:", updates.achievements);
    console.log("📝 Social Links:", updates.socialLinks);

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: userObj,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// UPLOAD PROFILE PHOTO (Base64 Only)
// ============================================================
const uploadProfilePhoto = async (req, res) => {
  try {
    const { profilePhoto } = req.body;

    // ✅ Validate base64 image
    if (!profilePhoto) {
      return res.status(400).json({
        success: false,
        message: "Profile photo (base64) is required",
      });
    }

    // ✅ Check if it's a valid base64 image
    if (!profilePhoto.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: "Invalid image format. Must be base64 data URL starting with 'data:image/'",
      });
    }

    // ✅ Validate image size
    try {
      const base64Data = profilePhoto.split(',')[1];
      if (base64Data) {
        const base64Size = Buffer.from(base64Data, 'base64').length;
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (base64Size > maxSize) {
          return res.status(400).json({
            success: false,
            message: "Image size too large. Maximum 5MB allowed.",
          });
        }
      }
    } catch (err) {
      console.warn("Could not validate image size:", err);
    }

    // ✅ Update user with base64 image
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        profilePhoto: profilePhoto,
        avatar: profilePhoto,
      },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userObj = user.toObject();
    userObj = ensureProfilePhoto(userObj);

    res.json({
      success: true,
      message: "Profile photo updated successfully",
      data: {
        profilePhoto: userObj.profilePhoto,
        avatar: userObj.avatar,
      },
    });
  } catch (error) {
    console.error("Upload photo error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// COMPLETE ONBOARDING
// ============================================================
// controllers/auth.controller.js

const completeOnboarding = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      fullName,
      phoneNumber,
      dailyHoursTarget,
      notificationPreferences,
      profilePhoto,
      position,
      employeeId,
      location,
      bio,
      department,
    } = req.body;

    console.log('📝 Onboarding Data Received:', {
      fullName,
      phoneNumber,
      location,
      department,
      position,
      employeeId,
      bio,
      hasPhoto: !!profilePhoto,
      photoLength: profilePhoto ? profilePhoto.length : 0
    });

    // ✅ Build updates object
    const updates = {
      fullName: fullName || req.user.fullName,
      phoneNumber: phoneNumber || null,
      notificationPreferences: notificationPreferences || {
        email: true,
        push: true,
        taskReminder: true,
        taskUpdates: true,
        deadlineAlert: true,
        teamUpdate: true,
      },
      firstLogin: false,
      onboardingCompleted: true,
      // ✅ Set departmentId to null explicitly
      departmentId: null,
    };

    // ✅ Add optional fields
    if (position) updates.position = position;
    if (employeeId) updates.employeeId = employeeId;
    if (location) updates.location = location;
    if (bio) updates.bio = bio;

    // ✅ Handle department
    if (department) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(department)) {
        updates.department = department;
        // ✅ Also set departmentId to the same value
        updates.departmentId = department;
      } else {
        console.log('⚠️ Invalid department ObjectId, skipping');
      }
    }

    // ✅ Handle profile photo
    if (profilePhoto) {
      if (!profilePhoto.startsWith('data:image/')) {
        return res.status(400).json({
          success: false,
          message: "Invalid image format. Must be base64 data URL.",
        });
      }
      updates.profilePhoto = profilePhoto;
      updates.avatar = profilePhoto;
    }

    console.log('👤 User before update:', {
      id: req.user._id,
      fullName: req.user.fullName,
      hasPhoto: !!req.user.profilePhoto
    });

    // ✅ Update user
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { $set: updates },
      {
        new: true,
        runValidators: true,
        strictPopulate: false,
        lean: true
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // ✅ Remove sensitive fields
    delete user.password;
    delete user.__v;

    console.log('✅ User after update:', {
      id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      location: user.location,
      bio: user.bio,
      position: user.position,
      employeeId: user.employeeId,
      department: user.department,
      departmentId: user.departmentId,
      hasPhoto: !!user.profilePhoto,
      onboardingCompleted: user.onboardingCompleted
    });

    res.json({
      success: true,
      message: "Onboarding completed successfully",
      data: user,
    });

  } catch (error) {
    console.error("❌ Error completing onboarding:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error completing onboarding",
    });
  }
};

// ============================================================
// FORGOT PASSWORD
// ============================================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({
        success: true,
        message: "If your email is registered, you will receive a password reset link",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = Date.now() + 3600000;

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;

    const emailContent = `
      <div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 20px 20px 0 0;">
        <h1 style="font-size: 28px; margin-bottom: 10px;">🔐 Password Reset</h1>
        <p>Reset your TaskManager account password</p>
      </div>
      <div class="content" style="padding: 40px 30px; background: #ffffff;">
        <p>Hello <strong>${user.fullName}</strong>,</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; font-size: 12px; color: #64748b; background: #f1f5f9; padding: 10px; border-radius: 5px;">${resetUrl}</p>
        <p style="margin-top: 20px;">This link will expire in <strong>1 hour</strong>.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 14px; color: #64748b;">For security, this link can only be used once.</p>
      </div>
    `;

    await sendEmail(
      user.email,
      "🔐 Password Reset Request",
      EmailTemplates.getBaseTemplate(emailContent, "Password Reset"),
    );

    res.json({
      success: true,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// RESET PASSWORD
// ============================================================
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token. Please request a new one.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const confirmContent = `
      <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 20px 20px 0 0;">
        <h1 style="font-size: 28px; margin-bottom: 10px;">✅ Password Reset Successful</h1>
        <p>Your password has been changed</p>
      </div>
      <div class="content" style="padding: 40px 30px; background: #ffffff;">
        <p>Hello <strong>${user.fullName}</strong>,</p>
        <div style="background: #d1fae5; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <p style="font-size: 48px;">🔐</p>
          <p style="color: #065f46;">Your password has been successfully reset.</p>
        </div>
        <p>If you did not perform this action, please contact support immediately.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/login" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600;">Sign In</a>
        </div>
      </div>
    `;

    await sendEmail(
      user.email,
      "✅ Password Reset Successful",
      EmailTemplates.getBaseTemplate(confirmContent, "Password Reset Success"),
    );

    res.json({
      success: true,
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// EXPORT USERS
// ============================================================
const exportUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("department", "name code")
      .populate("roles", "name code level");

    const csvData = users.map((user) => {
      const obj = user.toObject();
      return {
        "Full Name": obj.fullName,
        Email: obj.email,
        Role: obj.role,
        "Employee ID": obj.employeeId,
        Department: obj.department?.name || "N/A",
        Status: obj.isActive ? "Active" : "Inactive",
        "Last Login": obj.lastLogin
          ? new Date(obj.lastLogin).toLocaleDateString()
          : "Never",
        "Created At": new Date(obj.createdAt).toLocaleDateString(),
      };
    });

    res.json({
      success: true,
      data: csvData,
      count: csvData.length,
    });
  } catch (error) {
    console.error("Export users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// BULK IMPORT USERS
// ============================================================
const bulkImportUsers = async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Users array is required",
      });
    }

    const results = {
      successful: [],
      failed: [],
    };

    const departmentsToUpdate = new Set();

    for (const userData of users) {
      try {
        const { fullName, email, password, employeeId, role, department } = userData;

        const existingUser = await User.findOne({
          $or: [{ email: email.toLowerCase() }, { employeeId }],
        });
        if (existingUser) {
          results.failed.push({ ...userData, error: "User already exists" });
          continue;
        }

        let roleId = null;
        if (role) {
          const roleDoc = await Role.findOne({ code: role.toUpperCase() });
          if (roleDoc) {
            roleId = roleDoc._id;
          }
        } else {
          const defaultRole = await Role.findOne({ code: "EMPLOYEE" });
          if (defaultRole) {
            roleId = defaultRole._id;
          }
        }

        const hashedPassword = await bcrypt.hash(password || "Temp@123", 10);

        const user = await User.create({
          fullName,
          email: email.toLowerCase(),
          password: hashedPassword,
          employeeId: employeeId || `EMP${Date.now()}`,
          role: role || "employee",
          roles: roleId ? [roleId] : [],
          department: department || null,
          isActive: true,
        });

        if (department) {
          departmentsToUpdate.add(department.toString());
        }

        results.successful.push(sanitizeUser(user));
      } catch (error) {
        results.failed.push({ ...userData, error: error.message });
      }
    }

    if (departmentsToUpdate.size > 0) {
      const { Department } = require("../models/Department.model");
      for (const deptId of departmentsToUpdate) {
        const dept = await Department.findById(deptId);
        if (dept) {
          await dept.updateEmployeeCount();
        }
      }
    }

    res.json({
      success: true,
      message: `Imported ${results.successful.length} users, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};


// ============================================================
// CHANGE USER PASSWORD (Admin only)
// ============================================================
// controllers/auth.controller.js - FIXED changeUserPassword

const changeUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    console.log("🔑 Change password request for user ID:", id);
    console.log("📝 New password length:", newPassword?.length);

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // ✅ Find user WITHOUT selecting password first
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("👤 User found:", user.email);

    // ✅ Directly hash the password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log("🔑 Hashed password created:", hashedPassword.substring(0, 30) + "...");

    // ✅ Update using findByIdAndUpdate to bypass pre-save issues
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          password: hashedPassword,
          isPasswordChanged: true,
        }
      },
      { new: true, select: '+password' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Failed to update user password",
      });
    }

    // ✅ Verify the password was saved correctly
    const verifyUser = await User.findById(id).select("+password");
    const testCompare = await bcrypt.compare(newPassword, verifyUser.password);
    console.log("🧪 Password verification result:", testCompare);

    if (!testCompare) {
      console.error("❌ Password verification failed!");
      return res.status(500).json({
        success: false,
        message: "Password update failed. Please try again.",
      });
    }

    console.log(`✅ Password changed successfully for ${user.fullName}`);

    // ✅ Create audit log
    await createAuditLog({
      action: "update",
      resource: "user",
      resourceId: user._id,
      userId: req.user._id,
      user: {
        id: user._id,
        name: user.fullName || user.email,
        email: user.email,
        role: user.role,
      },
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"] || "Unknown",
      details: {
        method: "POST",
        path: `/users/${id}/change-password`,
        status: "success",
        updatedUser: user.email,
      },
      status: "success",
      severity: "low",
    });

    res.json({
      success: true,
      message: `Password changed successfully for ${user.fullName}`,
    });
  } catch (error) {
    console.error("Change user password error:", error);
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
  register,
  adminCreateUser,
  sendTrialWelcomeEmail,
  sendAdminCreatedWelcomeEmail,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  completeOnboarding,
  getAllUsers,
  getMe,
  getUserProfile,
  updateUser,
  deleteUser,
  changeUserRole,
  getActiveUsers,
  updateMyProfile,
  uploadProfilePhoto,
  exportUsers,
  bulkImportUsers,
  changeUserPassword,
};