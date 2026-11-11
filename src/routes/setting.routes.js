// routes/setting.routes.js
const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth.middleware");
const {
    getSettings,
    updateSettings,
    resetSettings,
    getPublicSettings,
    uploadBrandingImage,
    deleteBrandingImage,
    // ✅ Import email functions
    getEmailSettings,
    updateEmailSettings,
    testEmailConfiguration,
    getSecuritySettings,
    updateSecuritySettings,
    addSecurityQuestion,
    removeSecurityQuestion,
    getSecurityLogs,
    getActiveSessions,
    revokeSession,
    testLockoutMechanism
} = require("../controllers/setting.controller");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// PUBLIC SETTINGS
// ============================================================
router.get("/public", getPublicSettings);

// ============================================================
// GENERAL SETTINGS
// ============================================================
router.get("/", requireRole("super_admin", "admin"), getSettings);
router.get("/general", requireRole("super_admin", "admin"), getSettings);
router.put("/", requireRole("super_admin", "admin"), updateSettings);
router.put("/general", requireRole("super_admin", "admin"), updateSettings);
router.post("/reset", requireRole("super_admin", "admin"), resetSettings);

// ============================================================
// BRANDING IMAGE ROUTES
// ============================================================
router.post(
    "/branding/upload",
    requireRole("super_admin", "admin"),
    uploadBrandingImage
);
router.delete(
    "/branding/:imageType",
    requireRole("super_admin", "admin"),
    deleteBrandingImage
);

// ============================================================
// EMAIL SETTINGS ROUTES - ✅ ADD THESE
// ============================================================
router.get(
    "/email",
    requireRole("super_admin", "admin"),
    getEmailSettings
);
router.get(
    "/email/general",
    requireRole("super_admin", "admin"),
    getEmailSettings
);
router.put(
    "/email",
    requireRole("super_admin", "admin"),
    updateEmailSettings
);
router.put(
    "/email/general",
    requireRole("super_admin", "admin"),
    updateEmailSettings
);
router.post(
    "/email/test",
    requireRole("super_admin", "admin"),
    testEmailConfiguration
);
router.get(
    "/security",
    requireRole("super_admin", "admin"),
    getSecuritySettings
);
router.put(
    "/security",
    requireRole("super_admin", "admin"),
    updateSecuritySettings
);
router.post(
    "/security/questions",
    requireRole("super_admin", "admin"),
    addSecurityQuestion
);
router.delete(
    "/security/questions/:question",
    requireRole("super_admin", "admin"),
    removeSecurityQuestion
);
router.get(
    "/security/logs",
    requireRole("super_admin", "admin"),
    getSecurityLogs
);
router.get(
    "/security/sessions",
    requireRole("super_admin", "admin"),
    getActiveSessions
);
router.delete(
    "/security/sessions/:sessionId",
    requireRole("super_admin", "admin"),
    revokeSession
);
router.post(
    "/security/test-lockout",
    requireRole("super_admin", "admin"),
    testLockoutMechanism
);

module.exports = router;