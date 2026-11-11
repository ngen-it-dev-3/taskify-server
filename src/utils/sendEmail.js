// src/utils/sendEmail.js
// ============================================================
// Central email sender — wraps Nodemailer with retry + logging
// Usage:
//   const { sendEmail } = require('../utils/sendEmail');
//   await sendEmail({ to, subject, html, text });
// ============================================================

const nodemailer = require('nodemailer');

/* ============================================================
 * TRANSPORTER
 * ------------------------------------------------------------
 * Config read from .env:
 *   EMAIL_HOST   (default: smtp.gmail.com)
 *   EMAIL_PORT   (default: 587)
 *   EMAIL_USER
 *   EMAIL_PASS
 *   EMAIL_FROM   (optional, defaults to EMAIL_USER)
 *
 * Notes:
 *   • family: 4 → forces IPv4, avoids ENETUNREACH on some clouds
 *   • secure must be TRUE for port 465, FALSE for 587
 *   • pool: true → reuses SMTP connections for better performance
 * ============================================================ */
const SMTP_PORT = Number(process.env.EMAIL_PORT) || 587;

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // implicit TLS only on 465
    family: 4, // IPv4 only
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
    tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
});

/* ============================================================
 * LAZY VERIFY — call once at boot if you want a ready signal
 * ============================================================ */
let verified = false;
async function verifyEmailOnce() {
    if (verified) return true;
    try {
        await transporter.verify();
        verified = true;
        console.log('✅ [sendEmail] transporter verified');
        return true;
    } catch (err) {
        console.warn('⚠️  [sendEmail] verify failed:', err.message);
        return false;
    }
}

/* ============================================================
 * RETRY WRAPPER — retries once on transient network errors
 * ============================================================ */
async function sendWithRetry(mailOptions, attempt = 1) {
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[sendEmail] ✅ sent to ${mailOptions.to} — id=${info.messageId}`);
        return info;
    } catch (err) {
        const isTransient =
            /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|socket hang up|Connection timeout/i.test(
                err.message
            );

        if (attempt < 2 && isTransient) {
            console.warn(
                `[sendEmail] ⟳ transient failure (attempt ${attempt}): ${err.message}`
            );
            await new Promise((r) => setTimeout(r, 1500));
            return sendWithRetry(mailOptions, attempt + 1);
        }

        console.error(`[sendEmail] ❌ failed: ${err.message}`);
        throw err;
    }
}

/* ============================================================
 * PUBLIC API
 * ============================================================ */

/**
 * Send an email.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.to       Recipient(s)
 * @param {string} opts.subject           Subject line
 * @param {string} [opts.html]            HTML body
 * @param {string} [opts.text]            Plain text body (auto-derived from html if omitted)
 * @param {string|string[]} [opts.cc]     CC recipients
 * @param {string|string[]} [opts.bcc]    BCC recipients
 * @param {string} [opts.replyTo]         Reply-To address
 * @param {Array}  [opts.attachments]     Nodemailer attachments array
 * @param {string} [opts.from]            Override default from
 *
 * @returns {Promise<Object>} Nodemailer info object
 */
async function sendEmail({
    to,
    subject,
    html,
    text,
    cc,
    bcc,
    replyTo,
    attachments,
    from,
}) {
    if (!to) throw new Error('[sendEmail] "to" is required');
    if (!subject) throw new Error('[sendEmail] "subject" is required');
    if (!html && !text) throw new Error('[sendEmail] "html" or "text" is required');

    const recipients = Array.isArray(to) ? to.join(', ') : String(to);

    const fromAddress =
        from ||
        process.env.EMAIL_FROM ||
        `"NGEN IT CRM" <${process.env.EMAIL_USER}>`;

    // Auto-derive plain-text from HTML if not provided
    const plainText =
        text ||
        (html ? html.replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() : undefined);

    const mailOptions = {
        from: fromAddress,
        to: recipients,
        subject,
        html,
        text: plainText,
        ...(cc && { cc: Array.isArray(cc) ? cc.join(', ') : cc }),
        ...(bcc && { bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc }),
        ...(replyTo && { replyTo }),
        ...(attachments && { attachments }),
    };

    return sendWithRetry(mailOptions);
}

/* ============================================================
 * CONVENIENCE WRAPPERS (optional, for common cases)
 * ============================================================ */
async function sendTextEmail(to, subject, text) {
    return sendEmail({ to, subject, text });
}

async function sendHtmlEmail(to, subject, html) {
    return sendEmail({ to, subject, html });
}

module.exports = {
    transporter,
    verifyEmailOnce,
    sendEmail,
    sendMail: sendEmail,       // alias for compatibility
    send: sendEmail,           // alias for compatibility
    sendTextEmail,
    sendHtmlEmail,
};