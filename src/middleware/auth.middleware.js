// src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");
const { User } = require("../models/User.model");

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // IMPORTANT: Populate the roles field
    const user = await User.findById(decoded.userId)
      .select("-password")
      .populate("roles", "name code level permissions");

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "User not found or inactive" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Helper function to check if user has any of the required roles
    const hasRequiredRole = () => {
      // 1. Check legacy role field
      if (req.user.role && roles.includes(req.user.role)) {
        return true;
      }

      // 2. Check populated roles array
      if (req.user.roles && req.user.roles.length > 0) {
        const userRoleCodes = req.user.roles.map((r) => r.code.toLowerCase());
        return roles.some((role) => userRoleCodes.includes(role.toLowerCase()));
      }

      // 3. Check if roles array has ObjectIds (fallback)
      if (req.user.roles && req.user.roles.length > 0) {
        // If roles are not populated, we need to check differently
        // But we already populated above, so this shouldn't happen
      }

      return false;
    };

    if (!hasRequiredRole()) {
      console.log(`Access denied for user ${req.user.email}. Required roles: ${roles.join(", ")}`);
      console.log(`User roles:`, {
        legacy: req.user.role,
        populated: req.user.roles ? req.user.roles.map(r => r.code) : [],
      });

      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
};

const requireMinRole = (minRole) => {
  const roleHierarchy = {
    tender_user: 1,
    employee: 1,
    line_manager: 2,
    project_manager: 3,
    dept_manager: 4,
    hr_manager: 5,
    admin: 6,
    super_admin: 7,
  };

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const hasMinRole = () => {
      // Check legacy role field
      if (req.user.role) {
        const userLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[minRole] || 0;
        if (userLevel >= requiredLevel) {
          return true;
        }
      }

      // Check populated roles array
      if (req.user.roles && req.user.roles.length > 0) {
        const userLevels = req.user.roles.map((r) => {
          const roleCode = r.code.toLowerCase();
          return roleHierarchy[roleCode] || 0;
        });
        const maxLevel = Math.max(...userLevels);
        const requiredLevel = roleHierarchy[minRole] || 0;
        if (maxLevel >= requiredLevel) {
          return true;
        }
      }

      return false;
    };

    if (!hasMinRole()) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Minimum role required: ${minRole}`,
      });
    }

    next();
  };
};

module.exports = { authenticate, requireRole, requireMinRole };