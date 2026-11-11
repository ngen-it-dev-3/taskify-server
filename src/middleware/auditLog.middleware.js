// middleware/auditLog.middleware.js
const { createAuditLog } = require("../controllers/auditLog.controller");
const requestIp = require("request-ip");

// Simple middleware without heavy dependencies
const auditLog = (options = {}) => {
  return async (req, res, next) => {
    // Store original send method
    const originalSend = res.send;
    const originalJson = res.json;

    // Capture response data
    let responseData = null;

    res.send = function (data) {
      responseData = data;
      return originalSend.call(this, data);
    };

    res.json = function (data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    // Continue with request
    next();

    // After response is sent, create audit log
    res.on("finish", async () => {
      // Skip if no user (unauthenticated)
      if (!req.user) return;

      // Get IP
      const ip = requestIp.getClientIp(req) || req.ip || "Unknown";

      // Parse user agent
      const userAgent = req.headers["user-agent"] || "Unknown";

      // Determine status from response
      const statusCode = res.statusCode;
      let status = "success";
      let severity = "low";

      if (statusCode >= 400 && statusCode < 500) {
        status = "failed";
        severity = "medium";
      } else if (statusCode >= 500) {
        status = "failed";
        severity = "high";
      }

      // Determine action from route
      let action = options.action || "view";
      const method = req.method;
      if (method === "POST") action = options.action || "create";
      else if (method === "PUT" || method === "PATCH") action = options.action || "update";
      else if (method === "DELETE") action = options.action || "delete";
      else if (method === "GET") action = options.action || "view";

      // Determine resource from route
      const path = req.path;
      let resource = options.resource || "unknown";

      if (!options.resource) {
        if (path.includes("/users") || path.includes("/user")) resource = "user";
        else if (path.includes("/roles") || path.includes("/role")) resource = "role";
        else if (path.includes("/tasks") || path.includes("/task")) resource = "task";
        else if (path.includes("/projects") || path.includes("/project")) resource = "project";
        else if (path.includes("/teams") || path.includes("/team")) resource = "team";
        else if (path.includes("/settings") || path.includes("/setting")) resource = "setting";
        else if (path.includes("/api-keys")) resource = "api";
        else if (path.includes("/audit")) resource = "audit";
        else if (path.includes("/pricing")) resource = "pricing_plan";
        else if (path.includes("/billing")) resource = "billing";
        else if (path.includes("/subscription")) resource = "subscription";
      }

      // Create log data
      const logData = {
        action: action,
        resource: resource,
        resourceId: req.params.id || null,
        userId: req.user._id,
        user: {
          id: req.user._id,
          name: req.user.fullName || req.user.name || "Unknown",
          email: req.user.email || "unknown@example.com",
          role: req.user.role || "user",
        },
        ip: ip,
        userAgent: userAgent,
        device: "Unknown",
        location: "Unknown",
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body,
          params: req.params,
          statusCode: statusCode,
          response: responseData,
        },
        status: status,
        severity: options.severity || severity,
        metadata: {
          browser: "Unknown",
          os: "Unknown",
          platform: "Unknown",
        },
      };

      // Create audit log asynchronously (don't wait for it)
      createAuditLog(logData).catch((err) => {
        console.error("Failed to create audit log:", err);
      });
    });
  };
};

module.exports = { auditLog };