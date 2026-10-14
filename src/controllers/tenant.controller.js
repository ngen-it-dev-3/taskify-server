// src/controllers/tenant.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant.model");
const { User } = require("../models/User.model");
const { sendWelcomeEmail } = require("../utils/siteMailer");

/* ---------- helpers ---------- */

function generateTempPassword() {
    return crypto.randomBytes(6).toString("base64url"); // e.g. "aG7_k2QwP1"
}

function slugify(str) {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(base) {
    let slug = base;
    let i = 1;
    while (await Tenant.findOne({ slug })) {
        slug = `${base}-${i++}`;
    }
    return slug;
}

function signToken(user) {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

/* ==========================================================
   POST /api/tenant/checkout
   Body: { name, company, emails: [...], plan, payment, paymentIntentId }
   ========================================================== */
exports.createTrialTenant = async (req, res) => {
    try {
        const {
            name,
            company,
            emails = [],
            plan = "year",
            payment = "invoice",
            paymentIntentId = null,
            phone = "",
        } = req.body;

        // ---- validation ----
        if (!name || !company) {
            return res
                .status(400)
                .json({ success: false, message: "Name and company are required." });
        }
        if (!Array.isArray(emails) || emails.length === 0) {
            return res
                .status(400)
                .json({ success: false, message: "At least one email is required." });
        }

        const cleanedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
        const adminEmail = cleanedEmails[0];

        // ---- trial dates ----
        const trialStartsAt = new Date();
        const trialEndsAt = new Date(trialStartsAt);
        trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 1 week

        // ---- create tenant ----
        const slug = await uniqueSlug(slugify(company));
        const tenant = await Tenant.create({
            name: company,
            slug,
            adminName: name,
            adminEmail,
            plan,
            users: cleanedEmails.length,
            pricePerUser: 100,
            currency: "Tk",
            trialStatus: "active",
            trialStartsAt,
            trialEndsAt,
            paymentMethod: payment,
            paymentIntentId,
            memberEmails: cleanedEmails,
            phone,
            active: true,
        });

        // ---- create users ----
        const createdUsers = [];
        const tempPasswords = {};

        for (let i = 0; i < cleanedEmails.length; i++) {
            const email = cleanedEmails[i];
            const isAdmin = i === 0;

            const tempPassword = generateTempPassword();
            const passwordHash = await bcrypt.hash(tempPassword, 10);

            const user = await User.create({
                fullName: isAdmin ? name : email.split("@")[0],
                email,
                password: passwordHash,
                role: "tender_user",
                tenantId: tenant._id,
                isActive: true,
                isEmailVerified: false,
                mustChangePassword: true, // force change on first login
                trialEndsAt,
            });

            createdUsers.push(user);
            tempPasswords[email] = tempPassword;
        }

        // ---- send emails (fire and forget) ----
        const loginUrl = process.env.LOGIN_URL || "http://localhost:3000/login";
        for (let i = 0; i < createdUsers.length; i++) {
            const user = createdUsers[i];
            sendWelcomeEmail({
                to: user.email,
                name: user.fullName,
                company: tenant.name,
                tempPassword: tempPasswords[user.email],
                trialEndsAt: tenant.trialEndsAt,
                loginUrl,
                isAdmin: i === 0,   // only the first user is the admin
            }).catch((err) =>
                console.error(`[site-email] failed for ${user.email}:`, err.message)
            );
        }

        // ---- issue token for the admin ----
        const adminUser = createdUsers[0];
        const token = signToken(adminUser);

        // ---- response ----
        res.status(201).json({
            success: true,
            message: "Tenant created successfully.",
            data: {
                tenant: {
                    id: tenant._id,
                    name: tenant.name,
                    slug: tenant.slug,
                    users: tenant.users,
                    trialEndsAt: tenant.trialEndsAt,
                },
                users: createdUsers.map((u) => ({
                    id: u._id,
                    email: u.email,
                    role: u.role,
                })),
                token,
            },
        });
    } catch (err) {
        console.error("❌ createTrialTenant error:", err);
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with one of these emails already exists.",
            });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ==========================================================
   GET /api/tenant/me
   Returns the current tenant for the logged-in user
   ========================================================== */
exports.getMyTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, message: "Tenant not found." });
        }
        res.json({ success: true, data: tenant });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};