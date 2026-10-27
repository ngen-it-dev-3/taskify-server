// src/controllers/credential.controller.js
const { User } = require("../../models/User.model");
const SiteSource = require("../../models/SiteSource.model");
const CredentialAccessLog = require("../../models/CredentialAccessLog.model");

// ✅ 1. List Users for "Who has access"
const listCredentialUsers = async (req, res) => {
    try {
        const users = await User.find({ isActive: true })
            .select("fullName email role position department hasCredentialAccess credentialAccessGrantedBy credentialAccessGrantedAt")
            .populate("department", "name")
            .populate("credentialAccessGrantedBy", "fullName")
            .sort({ hasCredentialAccess: -1, fullName: 1 });

        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ 2. Grant / Revoke Access
const toggleCredentialAccess = async (req, res) => {
    try {
        const { id } = req.params;
        const { hasAccess } = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.hasCredentialAccess = hasAccess;
        user.credentialAccessGrantedBy = hasAccess ? req.user._id : null;
        user.credentialAccessGrantedAt = hasAccess ? new Date() : null;
        await user.save();

        // Log the action
        await CredentialAccessLog.create({
            userId: req.user._id,
            userName: req.user.fullName,
            action: hasAccess ? "grant_access" : "revoke_access",
            details: `${hasAccess ? "Granted" : "Revoked"} access for ${user.fullName}`,
        });

        res.json({ success: true, message: `Access ${hasAccess ? "granted" : "revoked"}`, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ 3. Get Activity Log
const getCredentialLogs = async (req, res) => {
    try {
        const logs = await CredentialAccessLog.find()
            .populate("userId", "fullName")
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ 4. Log a specific action (Reveal, Copy, Edit)
const logCredentialAction = async (req, res) => {
    try {
        const { action, siteId, siteName, details } = req.body;

        await CredentialAccessLog.create({
            userId: req.user._id,
            userName: req.user.fullName,
            action,
            siteId,
            siteName,
            details,
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    listCredentialUsers,
    toggleCredentialAccess,
    getCredentialLogs,
    logCredentialAction,
};