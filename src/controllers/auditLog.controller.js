// controllers/auditLog.controller.js
const { AuditLog } = require("../models/AuditLog.model");

// ============================================================
// CREATE AUDIT LOG (Safe - with error handling)
// ============================================================
const createAuditLog = async (data) => {
  try {
    // ✅ Validate required fields with defaults
    const logData = {
      action: data.action || "unknown",
      resource: data.resource || "system",
      resourceId: data.resourceId || null,
      userId: data.userId || data.user?.id || null,
      user: {
        id: data.user?.id || data.userId || null,
        name: data.user?.name || data.user?.fullName || "System",
        email: data.user?.email || "system@example.com",
        role: data.user?.role || "system",
      },
      ip: data.ip || "0.0.0.0",
      userAgent: data.userAgent || "Unknown",
      device: data.device || "Unknown",
      location: data.location || "Unknown",
      details: data.details || {},
      status: data.status || "success",
      severity: data.severity || "low",
      metadata: {
        browser: data.metadata?.browser || "Unknown",
        os: data.metadata?.os || "Unknown",
        platform: data.metadata?.platform || "Unknown",
      },
    };

    // ... rest of validation code ...

    const log = new AuditLog(logData);
    await log.save();
    return log;
  } catch (error) {
    console.error("Create audit log error:", error);
    return null;
  }
};

// ============================================================
// GET AUDIT LOGS
// ============================================================
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      action = "",
      resource = "",
      status = "",
      severity = "",
      userId = "",
      dateFrom = "",
      dateTo = "",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = {};

    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (userId) filter.userId = userId;

    // Date range
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    // Search
    if (search) {
      filter.$or = [
        { "user.name": { $regex: search, $options: "i" } },
        { "user.email": { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
        { resource: { $regex: search, $options: "i" } },
        { ip: { $regex: search, $options: "i" } },
      ];
    }

    // Get logs
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await AuditLog.countDocuments(filter);

    // Get stats
    const stats = await AuditLog.getStats(filter);

    res.json({
      success: true,
      data: {
        logs,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET AUDIT LOG STATS
// ============================================================
const getAuditLogStats = async (req, res) => {
  try {
    const stats = await AuditLog.getStats({});
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get audit log stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// GET AUDIT LOG BY ID
// ============================================================
const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await AuditLog.findById(id);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }
    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("Get audit log by id error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

// ============================================================
// EXPORT AUDIT LOGS - FIXED
// ============================================================
const exportAuditLogs = async (req, res) => {
  try {
    const {
      search = "",
      action = "",
      resource = "",
      status = "",
      severity = "",
      userId = "",
      dateFrom = "",
      dateTo = "",
      format = "csv",
    } = req.query;

    // Build filter
    const filter = {};

    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (userId) filter.userId = userId;

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      filter.$or = [
        { "user.name": { $regex: search, $options: "i" } },
        { "user.email": { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
        { resource: { $regex: search, $options: "i" } },
      ];
    }

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(10000);

    // If no logs found
    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No audit logs found to export",
      });
    }

    // Format data for export
    const exportData = logs.map((log) => ({
      Timestamp: log.createdAt?.toISOString() || "",
      User: log.user?.name || "System",
      Email: log.user?.email || "system@example.com",
      Action: log.action || "unknown",
      Resource: log.resource || "system",
      "Resource ID": log.resourceId || "",
      Status: log.status || "success",
      Severity: log.severity || "low",
      IP: log.ip || "0.0.0.0",
      Location: log.location || "Unknown",
      Device: log.device || "Unknown",
      Browser: log.metadata?.browser || "Unknown",
      OS: log.metadata?.os || "Unknown",
      Details: JSON.stringify(log.details || {}),
    }));

    // Handle JSON format
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=audit-logs-${new Date().toISOString().split("T")[0]}.json`
      );
      return res.json(exportData);
    }

    // Handle CSV format (default)
    const headers = Object.keys(exportData[0] || {});

    // Build CSV with proper escaping
    let csvRows = [];
    // Add headers
    csvRows.push(headers.join(","));

    // Add data rows
    for (const row of exportData) {
      const values = headers.map(header => {
        const value = row[header] || "";
        // Escape commas and quotes
        const stringValue = String(value);
        if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(","));
    }

    const csvContent = csvRows.join("\n");
    const csvWithBOM = "\uFEFF" + csvContent;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=audit-logs-${new Date().toISOString().split("T")[0]}.csv`
    );
    res.setHeader("Cache-Control", "no-cache");
    return res.send(csvWithBOM);
  } catch (error) {
    console.error("Export audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};
// ============================================================
// DELETE AUDIT LOG - ADD THIS
// ============================================================
const deleteAuditLog = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if log exists
    const log = await AuditLog.findById(id);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }
    
    // Delete the log
    await AuditLog.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: "Audit log deleted successfully",
    });
  } catch (error) {
    console.error("Delete audit log error:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogStats,
  getAuditLogById,
  exportAuditLogs,
  createAuditLog,
  deleteAuditLog
};