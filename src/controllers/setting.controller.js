// controllers/setting.controller.js
const { Setting } = require("../models/Setting.model");

// ============================================================
// HELPER: Validate Base64 Image
// ============================================================
const validateBase64Image = (base64String, maxSizeMB = 5) => {
    if (!base64String) return { valid: true };

    // Check if it's empty (user wants to remove image)
    if (base64String === "") return { valid: true };

    // Check if it's a valid base64 image
    const validPrefixes = [
        'data:image/jpeg;base64,',
        'data:image/png;base64,',
        'data:image/gif;base64,',
        'data:image/webp;base64,',
        'data:image/svg+xml;base64,',
    ];

    const isValidPrefix = validPrefixes.some(prefix => base64String.startsWith(prefix));

    if (!isValidPrefix) {
        return {
            valid: false,
            error: "Invalid image format. Must be JPEG, PNG, GIF, WebP, or SVG."
        };
    }

    // Check file size
    try {
        const base64Data = base64String.split(',')[1];
        if (base64Data) {
            const sizeInBytes = Buffer.from(base64Data, 'base64').length;
            const maxSize = maxSizeMB * 1024 * 1024;
            if (sizeInBytes > maxSize) {
                return {
                    valid: false,
                    error: `Image size exceeds ${maxSizeMB}MB limit. Current size: ${(sizeInBytes / (1024 * 1024)).toFixed(2)}MB`
                };
            }
        }
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: "Invalid base64 data"
        };
    }
};

// ============================================================
// HELPER: Get Image Size
// ============================================================
const getImageSize = (base64String) => {
    if (!base64String) return 0;
    try {
        const base64Data = base64String.split(',')[1];
        if (base64Data) {
            return Buffer.from(base64Data, 'base64').length;
        }
        return 0;
    } catch {
        return 0;
    }
};

// ============================================================
// GET SETTINGS
// ============================================================
const getSettings = async (req, res) => {
    try {
        const settings = await Setting.getSettings();

        // Add image size information for debugging
        const brandingImages = settings.brandingImages || {};
        const imageSizes = {};
        for (const [key, value] of Object.entries(brandingImages)) {
            if (value) {
                imageSizes[key] = getImageSize(value);
            }
        }

        res.json({
            success: true,
            data: {
                ...settings.toObject(),
                _imageSizes: imageSizes,
            },
        });
    } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// UPDATE SETTINGS
// ============================================================
const updateSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const updates = req.body;

        console.log("📝 Updating settings:", Object.keys(updates));

        // Allowed fields
        const allowedFields = [
            // General
            "systemName", "systemLogo", "systemEmail", "systemPhone", "systemAddress",
            "timezone", "dateFormat", "timeFormat", "weekStartDay", "currency", "currencySymbol",

            // Branding Images - ALLOW ALL IMAGE FIELDS
            "brandingImages",

            // Authentication
            "allowRegistration", "requireEmailVerification", "defaultRole",
            "sessionTimeout", "maxLoginAttempts", "lockoutDuration", "passwordPolicy",

            // Security
            "twoFactorAuth", "ipWhitelist", "allowedDomains",
            "maintenanceMode", "maintenanceMessage",

            // Notifications
            "emailNotifications", "pushNotifications", "desktopNotifications", "notificationSound",

            // Preferences
            "language", "theme", "sidebarCollapsed", "compactMode",

            // Features
            "enableKPIModule", "enableTimesheetModule", "enableLeaveModule",
            "enableChatModule", "enableReportingModule", "enableAIAssistant",

            // Integrations
            "enableSlackIntegration", "slackWebhookUrl",
            "enableDiscordIntegration", "discordWebhookUrl",
        ];

        // Filter only allowed fields
        const filteredUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        // ============================================================
        // VALIDATE BRANDING IMAGES (Base64)
        // ============================================================
        if (updates.brandingImages) {
            const brandingImages = updates.brandingImages;
            const imageFields = [
                { key: 'logo', maxSize: 5 },
                { key: 'favicon', maxSize: 1 },
                { key: 'loginBackground', maxSize: 5 },
                { key: 'dashboardBanner', maxSize: 5 },
                { key: 'emailHeader', maxSize: 2 },
                { key: 'emailFooter', maxSize: 2 },
            ];

            const invalidImages = [];

            for (const { key, maxSize } of imageFields) {
                if (brandingImages[key] !== undefined) {
                    // If empty string, allow (user wants to remove image)
                    if (brandingImages[key] === "") {
                        continue;
                    }
                    // Validate base64
                    const result = validateBase64Image(brandingImages[key], maxSize);
                    if (!result.valid) {
                        invalidImages.push({ field: key, error: result.error });
                    }
                }
            }

            if (invalidImages.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid images detected",
                    errors: invalidImages,
                });
            }
        }

        // Validate email if provided
        if (filteredUpdates.systemEmail) {
            const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
            if (!emailRegex.test(filteredUpdates.systemEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid system email format",
                });
            }
        }

        // Validate password policy
        if (filteredUpdates.passwordPolicy) {
            const { minLength, expireDays } = filteredUpdates.passwordPolicy;
            if (minLength && (minLength < 4 || minLength > 20)) {
                return res.status(400).json({
                    success: false,
                    message: "Password minimum length must be between 4 and 20",
                });
            }
            if (expireDays !== undefined && expireDays < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Password expiry days cannot be negative",
                });
            }
        }

        // Validate IP whitelist
        if (filteredUpdates.ipWhitelist) {
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            const invalidIps = filteredUpdates.ipWhitelist.filter(ip => !ipRegex.test(ip));
            if (invalidIps.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid IP addresses: ${invalidIps.join(", ")}`,
                });
            }
        }

        // Validate session timeout
        if (filteredUpdates.sessionTimeout) {
            if (filteredUpdates.sessionTimeout < 5 || filteredUpdates.sessionTimeout > 480) {
                return res.status(400).json({
                    success: false,
                    message: "Session timeout must be between 5 and 480 minutes",
                });
            }
        }

        // Validate max login attempts
        if (filteredUpdates.maxLoginAttempts) {
            if (filteredUpdates.maxLoginAttempts < 1 || filteredUpdates.maxLoginAttempts > 10) {
                return res.status(400).json({
                    success: false,
                    message: "Max login attempts must be between 1 and 10",
                });
            }
        }

        // Save settings
        const settings = await Setting.updateSettings(filteredUpdates, userId);

        console.log(`✅ Settings updated by user ${userId}`);

        res.json({
            success: true,
            message: "Settings updated successfully",
            data: settings,
        });
    } catch (error) {
        console.error("Update settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// RESET SETTINGS TO DEFAULT
// ============================================================
const resetSettings = async (req, res) => {
    try {
        const userId = req.user._id;

        // Delete existing settings
        await Setting.deleteMany({});

        // Create new default settings
        const settings = await Setting.create({});

        console.log(`🔄 Settings reset to default by user ${userId}`);

        res.json({
            success: true,
            message: "Settings reset to default successfully",
            data: settings,
        });
    } catch (error) {
        console.error("Reset settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET PUBLIC SETTINGS
// ============================================================
const getPublicSettings = async (req, res) => {
    try {
        const settings = await Setting.getSettings();

        const publicSettings = {
            systemName: settings.systemName,
            systemLogo: settings.systemLogo,
            brandingImages: settings.brandingImages || {},
            timezone: settings.timezone,
            dateFormat: settings.dateFormat,
            timeFormat: settings.timeFormat,
            weekStartDay: settings.weekStartDay,
            currency: settings.currency,
            currencySymbol: settings.currencySymbol,
            language: settings.language,
            theme: settings.theme,
            enableKPIModule: settings.enableKPIModule,
            enableTimesheetModule: settings.enableTimesheetModule,
            enableLeaveModule: settings.enableLeaveModule,
            enableChatModule: settings.enableChatModule,
            enableReportingModule: settings.enableReportingModule,
            enableAIAssistant: settings.enableAIAssistant,
            maintenanceMode: settings.maintenanceMode,
            maintenanceMessage: settings.maintenanceMessage,
        };

        res.json({
            success: true,
            data: publicSettings,
        });
    } catch (error) {
        console.error("Get public settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// UPLOAD BRANDING IMAGE (Single Image Upload)
// ============================================================
const uploadBrandingImage = async (req, res) => {
    try {
        const { imageType, imageData } = req.body;
        const userId = req.user._id;

        if (!imageType || !imageData) {
            return res.status(400).json({
                success: false,
                message: "Image type and data are required",
            });
        }

        // Validate image type
        const validTypes = ['logo', 'favicon', 'loginBackground', 'dashboardBanner', 'emailHeader', 'emailFooter'];
        if (!validTypes.includes(imageType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid image type. Must be one of: ${validTypes.join(", ")}`,
            });
        }

        // Get max size for image type
        const maxSizes = {
            logo: 5,
            favicon: 1,
            loginBackground: 5,
            dashboardBanner: 5,
            emailHeader: 2,
            emailFooter: 2,
        };

        // Validate base64 image
        const result = validateBase64Image(imageData, maxSizes[imageType] || 5);
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.error,
            });
        }

        // Get current settings
        const settings = await Setting.getSettings();

        // Update the specific image
        const brandingImages = settings.brandingImages || {};
        brandingImages[imageType] = imageData;

        // Save settings
        const updatedSettings = await Setting.updateSettings(
            { brandingImages },
            userId
        );

        console.log(`✅ ${imageType} uploaded by user ${userId}`);

        res.json({
            success: true,
            message: `${imageType} uploaded successfully`,
            data: {
                imageType,
                imageData: updatedSettings.brandingImages[imageType],
                size: getImageSize(imageData),
            },
        });
    } catch (error) {
        console.error("Upload branding image error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// DELETE BRANDING IMAGE
// ============================================================
const deleteBrandingImage = async (req, res) => {
    try {
        const { imageType } = req.params;
        const userId = req.user._id;

        const validTypes = ['logo', 'favicon', 'loginBackground', 'dashboardBanner', 'emailHeader', 'emailFooter'];
        if (!validTypes.includes(imageType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid image type. Must be one of: ${validTypes.join(", ")}`,
            });
        }

        const settings = await Setting.getSettings();
        const brandingImages = settings.brandingImages || {};
        brandingImages[imageType] = "";

        await Setting.updateSettings({ brandingImages }, userId);

        console.log(`🗑️ ${imageType} deleted by user ${userId}`);

        res.json({
            success: true,
            message: `${imageType} deleted successfully`,
        });
    } catch (error) {
        console.error("Delete branding image error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// EMAIL SETTINGS HANDLERS - ✅ ADD THESE
// ============================================================

// Get Email Settings
const getEmailSettings = async (req, res) => {
    try {
        const settings = await Setting.getSettings();

        // Extract email-related settings
        const emailSettings = {
            smtpHost: settings.smtpHost || "smtp.gmail.com",
            smtpPort: settings.smtpPort || 587,
            smtpSecure: settings.smtpSecure || false,
            smtpUser: settings.smtpUser || "",
            smtpPassword: settings.smtpPassword || "",
            smtpFromEmail: settings.smtpFromEmail || "",
            smtpFromName: settings.smtpFromName || "Task Management System",
            smtpReplyTo: settings.smtpReplyTo || "",

            welcomeEmailEnabled: settings.welcomeEmailEnabled !== undefined ? settings.welcomeEmailEnabled : true,
            welcomeEmailSubject: settings.welcomeEmailSubject || "Welcome to Task Management System",
            welcomeEmailTemplate: settings.welcomeEmailTemplate || "Welcome {{name}}! Your account has been created successfully.",

            passwordResetEnabled: settings.passwordResetEnabled !== undefined ? settings.passwordResetEnabled : true,
            passwordResetSubject: settings.passwordResetSubject || "Password Reset Request",
            passwordResetTemplate: settings.passwordResetTemplate || "Click the link below to reset your password: {{resetLink}}",

            taskAssignedEnabled: settings.taskAssignedEnabled !== undefined ? settings.taskAssignedEnabled : true,
            taskAssignedSubject: settings.taskAssignedSubject || "New Task Assigned: {{taskTitle}}",
            taskAssignedTemplate: settings.taskAssignedTemplate || "Hello {{name}}, a new task '{{taskTitle}}' has been assigned to you.",

            taskCompletedEnabled: settings.taskCompletedEnabled !== undefined ? settings.taskCompletedEnabled : true,
            taskCompletedSubject: settings.taskCompletedSubject || "Task Completed: {{taskTitle}}",
            taskCompletedTemplate: settings.taskCompletedTemplate || "Hello {{name}}, the task '{{taskTitle}}' has been marked as complete.",

            taskRejectedEnabled: settings.taskRejectedEnabled !== undefined ? settings.taskRejectedEnabled : true,
            taskRejectedSubject: settings.taskRejectedSubject || "Task Rejected: {{taskTitle}}",
            taskRejectedTemplate: settings.taskRejectedTemplate || "Hello {{name}}, the task '{{taskTitle}}' has been rejected. Reason: {{reason}}",

            leaveApprovedEnabled: settings.leaveApprovedEnabled !== undefined ? settings.leaveApprovedEnabled : true,
            leaveApprovedSubject: settings.leaveApprovedSubject || "Leave Request Approved",
            leaveApprovedTemplate: settings.leaveApprovedTemplate || "Hello {{name}}, your leave request has been approved.",

            leaveRejectedEnabled: settings.leaveRejectedEnabled !== undefined ? settings.leaveRejectedEnabled : true,
            leaveRejectedSubject: settings.leaveRejectedSubject || "Leave Request Rejected",
            leaveRejectedTemplate: settings.leaveRejectedTemplate || "Hello {{name}}, your leave request has been rejected. Reason: {{reason}}",

            kpiReportEnabled: settings.kpiReportEnabled !== undefined ? settings.kpiReportEnabled : true,
            kpiReportSubject: settings.kpiReportSubject || "KPI Report for {{month}}",
            kpiReportTemplate: settings.kpiReportTemplate || "Hello {{name}}, your KPI report for {{month}} is ready.",

            notifyOnTaskAssignment: settings.notifyOnTaskAssignment !== undefined ? settings.notifyOnTaskAssignment : true,
            notifyOnTaskUpdate: settings.notifyOnTaskUpdate !== undefined ? settings.notifyOnTaskUpdate : true,
            notifyOnTaskCompletion: settings.notifyOnTaskCompletion !== undefined ? settings.notifyOnTaskCompletion : true,
            notifyOnTaskApproval: settings.notifyOnTaskApproval !== undefined ? settings.notifyOnTaskApproval : true,
            notifyOnTaskRejection: settings.notifyOnTaskRejection !== undefined ? settings.notifyOnTaskRejection : true,
            notifyOnLeaveRequest: settings.notifyOnLeaveRequest !== undefined ? settings.notifyOnLeaveRequest : true,
            notifyOnLeaveApproval: settings.notifyOnLeaveApproval !== undefined ? settings.notifyOnLeaveApproval : true,
            notifyOnLeaveRejection: settings.notifyOnLeaveRejection !== undefined ? settings.notifyOnLeaveRejection : true,
            notifyOnKPIUpdate: settings.notifyOnKPIUpdate !== undefined ? settings.notifyOnKPIUpdate : true,
            notifyOnProjectUpdate: settings.notifyOnProjectUpdate !== undefined ? settings.notifyOnProjectUpdate : true,
            notifyOnTeamUpdate: settings.notifyOnTeamUpdate !== undefined ? settings.notifyOnTeamUpdate : true,
            notifyOnSystemUpdate: settings.notifyOnSystemUpdate !== undefined ? settings.notifyOnSystemUpdate : true,

            sendEmailOnError: settings.sendEmailOnError !== undefined ? settings.sendEmailOnError : true,
            errorRecipientEmail: settings.errorRecipientEmail || "",
            emailQueueEnabled: settings.emailQueueEnabled !== undefined ? settings.emailQueueEnabled : true,
            maxEmailsPerMinute: settings.maxEmailsPerMinute || 100,
            testEmailRecipient: settings.testEmailRecipient || "",

            emailSignature: settings.emailSignature || "Best regards,\nThe Task Management Team",
            emailFooter: settings.emailFooter || "© {{year}} Task Management System. All rights reserved.",
            emailHeader: settings.emailHeader || "",
        };

        res.json({
            success: true,
            data: emailSettings,
        });
    } catch (error) {
        console.error("Get email settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Update Email Settings
const updateEmailSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const updates = req.body;

        // Allowed email settings fields
        const allowedFields = [
            "smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPassword",
            "smtpFromEmail", "smtpFromName", "smtpReplyTo",
            "welcomeEmailEnabled", "welcomeEmailSubject", "welcomeEmailTemplate",
            "passwordResetEnabled", "passwordResetSubject", "passwordResetTemplate",
            "taskAssignedEnabled", "taskAssignedSubject", "taskAssignedTemplate",
            "taskCompletedEnabled", "taskCompletedSubject", "taskCompletedTemplate",
            "taskRejectedEnabled", "taskRejectedSubject", "taskRejectedTemplate",
            "leaveApprovedEnabled", "leaveApprovedSubject", "leaveApprovedTemplate",
            "leaveRejectedEnabled", "leaveRejectedSubject", "leaveRejectedTemplate",
            "kpiReportEnabled", "kpiReportSubject", "kpiReportTemplate",
            "notifyOnTaskAssignment", "notifyOnTaskUpdate", "notifyOnTaskCompletion",
            "notifyOnTaskApproval", "notifyOnTaskRejection",
            "notifyOnLeaveRequest", "notifyOnLeaveApproval", "notifyOnLeaveRejection",
            "notifyOnKPIUpdate", "notifyOnProjectUpdate", "notifyOnTeamUpdate", "notifyOnSystemUpdate",
            "sendEmailOnError", "errorRecipientEmail",
            "emailQueueEnabled", "maxEmailsPerMinute", "testEmailRecipient",
            "emailSignature", "emailFooter", "emailHeader",
        ];

        const filteredUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        // Validate SMTP settings if provided
        if (filteredUpdates.smtpHost) {
            // Basic validation
            if (!filteredUpdates.smtpHost.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "SMTP Host is required",
                });
            }
        }

        if (filteredUpdates.smtpPort) {
            const port = parseInt(filteredUpdates.smtpPort);
            if (isNaN(port) || port < 1 || port > 65535) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid SMTP port. Must be between 1 and 65535",
                });
            }
            filteredUpdates.smtpPort = port;
        }

        if (filteredUpdates.smtpFromEmail) {
            const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
            if (!emailRegex.test(filteredUpdates.smtpFromEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid From Email format",
                });
            }
        }

        // Save settings
        const settings = await Setting.updateSettings(filteredUpdates, userId);

        res.json({
            success: true,
            message: "Email settings updated successfully",
            data: settings,
        });
    } catch (error) {
        console.error("Update email settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};
// Test Email Configuration
const testEmailConfiguration = async (req, res) => {
    try {
        const { recipient } = req.body;

        if (!recipient) {
            return res.status(400).json({
                success: false,
                message: "Recipient email is required",
            });
        }

        // Get current settings
        const settings = await Setting.getSettings();

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: settings.smtpHost || "smtp.gmail.com",
            port: settings.smtpPort || 587,
            secure: settings.smtpSecure || false,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });

        // Send test email
        const info = await transporter.sendMail({
            from: settings.smtpFromEmail || settings.systemEmail,
            to: recipient,
            subject: "Test Email from Task Management System",
            html: `
        <h1>✅ Test Email</h1>
        <p>This is a test email from your Task Management System.</p>
        <p>If you received this email, your SMTP configuration is working correctly!</p>
        <hr>
        <p><strong>SMTP Host:</strong> ${settings.smtpHost}</p>
        <p><strong>SMTP Port:</strong> ${settings.smtpPort}</p>
        <p><strong>From:</strong> ${settings.smtpFromEmail || settings.systemEmail}</p>
        <p><strong>From Name:</strong> ${settings.smtpFromName || "Task Management System"}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          This email was sent from your Task Management System settings.
          If you didn't request this test, please ignore this email.
        </p>
      `,
        });

        console.log("✅ Test email sent:", info.messageId);

        res.json({
            success: true,
            message: "Test email sent successfully",
            data: {
                messageId: info.messageId,
                recipient: recipient,
            },
        });
    } catch (error) {
        console.error("Test email error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send test email: " + error.message,
            error: {
                code: error.code,
                command: error.command,
            },
        });
    }
};

// ============================================================
// SECURITY SETTINGS HANDLERS
// ============================================================

// Get Security Settings
const getSecuritySettings = async (req, res) => {
    try {
        const settings = await Setting.getSettings();

        const securitySettings = {
            // Password Policy
            passwordPolicy: settings.passwordPolicy || {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                expireDays: 90,
            },
            passwordHistoryCount: settings.passwordHistoryCount || 5,
            enforcePasswordExpiry: settings.enforcePasswordExpiry !== undefined ? settings.enforcePasswordExpiry : false,
            logoutOnPasswordChange: settings.logoutOnPasswordChange !== undefined ? settings.logoutOnPasswordChange : true,

            // Session Management
            sessionTimeout: settings.sessionTimeout || 60,
            sessionConcurrency: settings.sessionConcurrency !== undefined ? settings.sessionConcurrency : false,
            rememberMeDuration: settings.rememberMeDuration || 30,
            autoLogoutInactive: settings.autoLogoutInactive !== undefined ? settings.autoLogoutInactive : true,
            inactivityTimeout: settings.inactivityTimeout || 30,

            // Login Security
            maxLoginAttempts: settings.maxLoginAttempts || 5,
            lockoutDuration: settings.lockoutDuration || 30,
            twoFactorAuth: settings.twoFactorAuth !== undefined ? settings.twoFactorAuth : false,
            mfaMethods: settings.mfaMethods || ["authenticator", "sms", "email"],

            // Access Control
            ipWhitelist: settings.ipWhitelist || [],
            allowedDomains: settings.allowedDomains || [],
            securityQuestions: settings.securityQuestions || [],
            requireSecurityQuestions: settings.requireSecurityQuestions !== undefined ? settings.requireSecurityQuestions : false,

            // Rate Limiting
            rateLimitEnabled: settings.rateLimitEnabled !== undefined ? settings.rateLimitEnabled : true,
            rateLimitMaxRequests: settings.rateLimitMaxRequests || 100,
            rateLimitTimeWindow: settings.rateLimitTimeWindow || 60,

            // Security Alerts
            securityAlertsEnabled: settings.securityAlertsEnabled !== undefined ? settings.securityAlertsEnabled : true,
            securityAlertEmail: settings.securityAlertEmail || "",
        };

        res.json({
            success: true,
            data: securitySettings,
        });
    } catch (error) {
        console.error("Get security settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Update Security Settings
const updateSecuritySettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const updates = req.body;

        const allowedFields = [
            "passwordPolicy",
            "passwordHistoryCount", "enforcePasswordExpiry",
            "logoutOnPasswordChange",
            "sessionTimeout", "sessionConcurrency", "rememberMeDuration",
            "autoLogoutInactive", "inactivityTimeout",
            "maxLoginAttempts", "lockoutDuration", "twoFactorAuth", "mfaMethods",
            "ipWhitelist", "allowedDomains", "securityQuestions", "requireSecurityQuestions",
            "rateLimitEnabled", "rateLimitMaxRequests", "rateLimitTimeWindow",
            "securityAlertsEnabled", "securityAlertEmail",
        ];

        const filteredUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        // Validate password policy
        if (filteredUpdates.passwordPolicy) {
            const { minLength, expireDays } = filteredUpdates.passwordPolicy;
            if (minLength !== undefined && (minLength < 4 || minLength > 20)) {
                return res.status(400).json({
                    success: false,
                    message: "Password minimum length must be between 4 and 20 characters",
                });
            }
            if (expireDays !== undefined && expireDays < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Password expiry days cannot be negative",
                });
            }
        }

        // Validate session timeout
        if (filteredUpdates.sessionTimeout) {
            const timeout = parseInt(filteredUpdates.sessionTimeout);
            if (isNaN(timeout) || timeout < 5 || timeout > 1440) {
                return res.status(400).json({
                    success: false,
                    message: "Session timeout must be between 5 and 1440 minutes",
                });
            }
            filteredUpdates.sessionTimeout = timeout;
        }

        // Validate max login attempts
        if (filteredUpdates.maxLoginAttempts) {
            const attempts = parseInt(filteredUpdates.maxLoginAttempts);
            if (isNaN(attempts) || attempts < 1 || attempts > 20) {
                return res.status(400).json({
                    success: false,
                    message: "Max login attempts must be between 1 and 20",
                });
            }
            filteredUpdates.maxLoginAttempts = attempts;
        }

        // Validate lockout duration
        if (filteredUpdates.lockoutDuration) {
            const duration = parseInt(filteredUpdates.lockoutDuration);
            if (isNaN(duration) || duration < 1 || duration > 1440) {
                return res.status(400).json({
                    success: false,
                    message: "Lockout duration must be between 1 and 1440 minutes",
                });
            }
            filteredUpdates.lockoutDuration = duration;
        }

        // Validate IP whitelist
        if (filteredUpdates.ipWhitelist) {
            if (!Array.isArray(filteredUpdates.ipWhitelist)) {
                return res.status(400).json({
                    success: false,
                    message: "IP whitelist must be an array",
                });
            }
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            const invalidIPs = filteredUpdates.ipWhitelist.filter(
                ip => !ipRegex.test(ip) && ip !== ""
            );
            if (invalidIPs.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid IP address format in whitelist",
                    invalidIPs,
                });
            }
        }

        // Validate allowed domains
        if (filteredUpdates.allowedDomains) {
            if (!Array.isArray(filteredUpdates.allowedDomains)) {
                return res.status(400).json({
                    success: false,
                    message: "Allowed domains must be an array",
                });
            }
            const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
            const invalidDomains = filteredUpdates.allowedDomains.filter(
                domain => !domainRegex.test(domain) && domain !== ""
            );
            if (invalidDomains.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid domain format in allowed domains",
                    invalidDomains,
                });
            }
        }

        // Validate security alert email
        if (filteredUpdates.securityAlertEmail) {
            const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
            if (!emailRegex.test(filteredUpdates.securityAlertEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid security alert email format",
                });
            }
        }

        // Save settings
        const settings = await Setting.updateSettings(filteredUpdates, userId);

        res.json({
            success: true,
            message: "Security settings updated successfully",
            data: settings,
        });
    } catch (error) {
        console.error("Update security settings error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Add Security Question
const addSecurityQuestion = async (req, res) => {
    try {
        const userId = req.user._id;
        const { question } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({
                success: false,
                message: "Security question is required",
            });
        }

        const settings = await Setting.getSettings();
        const securityQuestions = settings.securityQuestions || [];

        if (securityQuestions.includes(question.trim())) {
            return res.status(400).json({
                success: false,
                message: "This security question already exists",
            });
        }

        securityQuestions.push(question.trim());
        await Setting.updateSettings({ securityQuestions }, userId);

        res.json({
            success: true,
            message: "Security question added successfully",
            data: { securityQuestions },
        });
    } catch (error) {
        console.error("Add security question error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Remove Security Question
const removeSecurityQuestion = async (req, res) => {
    try {
        const userId = req.user._id;
        const { question } = req.params;

        if (!question) {
            return res.status(400).json({
                success: false,
                message: "Security question is required",
            });
        }

        const settings = await Setting.getSettings();
        const securityQuestions = (settings.securityQuestions || []).filter(
            q => q !== decodeURIComponent(question)
        );

        await Setting.updateSettings({ securityQuestions }, userId);

        res.json({
            success: true,
            message: "Security question removed successfully",
            data: { securityQuestions },
        });
    } catch (error) {
        console.error("Remove security question error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Get Security Logs
const getSecurityLogs = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;

        // In production, fetch from SecurityLog model
        // For now, return mock data
        const mockLogs = [
            {
                id: 1,
                event: "LOGIN_SUCCESS",
                user: "John Doe",
                email: "john@example.com",
                ip: "192.168.1.1",
                timestamp: new Date(Date.now() - 1000 * 60 * 5),
                status: "success",
                details: "Login from new device",
            },
            {
                id: 2,
                event: "LOGIN_FAILURE",
                user: "Jane Smith",
                email: "jane@example.com",
                ip: "192.168.1.2",
                timestamp: new Date(Date.now() - 1000 * 60 * 15),
                status: "failed",
                details: "Invalid password",
            },
            {
                id: 3,
                event: "PASSWORD_CHANGE",
                user: "Alice Brown",
                email: "alice@example.com",
                ip: "192.168.1.3",
                timestamp: new Date(Date.now() - 1000 * 60 * 30),
                status: "success",
                details: "Password changed successfully",
            },
            {
                id: 4,
                event: "ACCOUNT_LOCKED",
                user: "Bob Wilson",
                email: "bob@example.com",
                ip: "192.168.1.4",
                timestamp: new Date(Date.now() - 1000 * 60 * 45),
                status: "warning",
                details: "Account locked due to multiple failed login attempts",
            },
            {
                id: 5,
                event: "TWO_FACTOR_ENABLED",
                user: "Carol Davis",
                email: "carol@example.com",
                ip: "192.168.1.5",
                timestamp: new Date(Date.now() - 1000 * 60 * 60),
                status: "success",
                details: "Two-factor authentication enabled",
            },
        ];

        // Paginate
        const start = (page - 1) * limit;
        const end = start + parseInt(limit);
        const paginatedLogs = mockLogs.slice(start, end);

        res.json({
            success: true,
            data: {
                logs: paginatedLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: mockLogs.length,
                    totalPages: Math.ceil(mockLogs.length / limit),
                },
            },
        });
    } catch (error) {
        console.error("Get security logs error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Get Active Sessions
const getActiveSessions = async (req, res) => {
    try {
        // In production, query sessions collection
        const mockSessions = [
            {
                id: "session_1",
                device: "Chrome on Windows",
                ip: "192.168.1.1",
                location: "New York, US",
                browser: "Chrome 120",
                os: "Windows 11",
                loginTime: new Date(Date.now() - 1000 * 60 * 5),
                lastActivity: new Date(Date.now() - 1000 * 30),
                isCurrent: true,
            },
            {
                id: "session_2",
                device: "Safari on iPhone",
                ip: "192.168.1.2",
                location: "Los Angeles, US",
                browser: "Safari 17",
                os: "iOS 17",
                loginTime: new Date(Date.now() - 1000 * 60 * 60),
                lastActivity: new Date(Date.now() - 1000 * 60 * 10),
                isCurrent: false,
            },
        ];

        res.json({
            success: true,
            data: {
                sessions: mockSessions,
                total: mockSessions.length,
            },
        });
    } catch (error) {
        console.error("Get active sessions error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Revoke Session
const revokeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        // In production, delete session from database
        console.log(`Revoking session: ${sessionId}`);

        res.json({
            success: true,
            message: "Session revoked successfully",
        });
    } catch (error) {
        console.error("Revoke session error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// Test Lockout Mechanism
const testLockoutMechanism = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required to test lockout",
            });
        }

        const settings = await Setting.getSettings();

        res.json({
            success: true,
            message: "Lockout test initiated",
            data: {
                email,
                maxAttempts: settings.maxLoginAttempts,
                lockoutDuration: settings.lockoutDuration,
                testInstructions: "Lockout will be triggered after exceeding max login attempts",
            },
        });
    } catch (error) {
        console.error("Test lockout error:", error);
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
    getSettings,
    updateSettings,
    resetSettings,
    getPublicSettings,
    uploadBrandingImage,
    deleteBrandingImage,
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
};