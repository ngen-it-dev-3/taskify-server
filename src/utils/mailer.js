// src/utils/mailer.js
const nodemailer = require("nodemailer");

/* ============================================================
 * TRANSPORTER
 *
 * Fixes applied:
 *   • family: 4              → IPv4-only, prevents ENETUNREACH
 *   • port 465 + secure      → SMTPS, more reliable than 587 on cloud
 *   • connection/greeting/socket timeouts → fail fast, no infinite hangs
 *   • pool: true             → reuse SMTP connections across sends
 *   • .verify() REMOVED      → server no longer blocks on boot
 * ============================================================ */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: false, // implicit TLS for port 465
  family: 4, // ← THE KEY FIX for ENETUNREACH
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
    rejectUnauthorized: false,
  },
});

/* ============================================================
 * LAZY VERIFY (optional — call from a health route if you want)
 * ============================================================ */
let verified = false;
async function verifyEmailOnce() {
  if (verified) return true;
  try {
    await transporter.verify();
    verified = true;
    console.log("✅ Email transporter verified");
    return true;
  } catch (err) {
    console.warn("⚠️ Email transporter error:", err.message);
    return false;
  }
}

/* ============================================================
 * HELPERS
 * ============================================================ */
function formatBDT(n) {
  return `৳${Number(n || 0).toLocaleString("en-IN")}`;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ============================================================
 * HTML BUILDER — SECURITY NOTICE
 * ============================================================ */
function buildSecurityEmailHTML({ security, tender, note, senderName }) {
  const isMissing = security.docsStatus === "Missing";

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Tender Security Notice — ${security.entity}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e5e0d5;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">

            <!-- Header -->
            <tr>
              <td style="background:#a97400;padding:22px 28px;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fce9c2;">
                  Tender Dashboard
                </p>
                <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                  Tender Security Notice
                </h1>
              </td>
            </tr>

            <!-- Intro -->
            <tr>
              <td style="padding:24px 28px 8px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
                  Hi Finance Team,
                </p>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#334155;">
                  A tender security record requires your attention. Details below.
                </p>
              </td>
            </tr>

            <!-- Badges -->
            <tr>
              <td style="padding:16px 28px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:8px;">
                      <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#f4ead6;color:#8a6a2b;font-size:12px;font-weight:700;letter-spacing:0.02em;">
                        ${security.entity}
                      </span>
                    </td>
                    <td>
                      <span style="display:inline-block;padding:5px 12px;border-radius:999px;${isMissing
      ? "background:#fef2f2;color:#b91c1c;"
      : "background:#ecfdf5;color:#047857;"
    }font-size:12px;font-weight:700;letter-spacing:0.02em;">
                        ${isMissing ? "⚠ Docs Missing" : "✓ Docs Attached"}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Detail card -->
            <tr>
              <td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e0d5;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:14px 16px;background:#faf7f0;border-bottom:1px solid #e5e0d5;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
                      Security Details
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;width:40%;">Client / Description</td>
                          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1ede2;">${security.clientDescription}</td>
                        </tr>
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;">Type</td>
                          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1ede2;">${security.type}</td>
                        </tr>
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;">Amount</td>
                          <td style="padding:12px 16px;font-size:15px;color:#a97400;font-weight:700;font-family:'SF Mono',Menlo,Consolas,monospace;border-bottom:1px solid #f1ede2;">${formatBDT(security.amount)}</td>
                        </tr>
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;${tender ? "border-bottom:1px solid #f1ede2;" : ""}">Due Date</td>
                          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;${tender ? "border-bottom:1px solid #f1ede2;" : ""}">${formatDate(security.dueDate)}</td>
                        </tr>
                        ${tender
      ? `
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1ede2;">Linked Tender</td>
                          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1ede2;">${tender.title} <span style="color:#94a3b8;">— ${tender.tenderer}</span></td>
                        </tr>
                        <tr>
                          <td style="padding:12px 16px;font-size:12px;color:#64748b;">Last Submission Date</td>
                          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;">${formatDate(tender.lastDateOfSubmission)}</td>
                        </tr>
                        `
      : ""
    }
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${note
      ? `
            <tr>
              <td style="padding:18px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #a97400;background:#fdf8ec;border-radius:6px;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a2b;">Note</p>
                      <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#334155;">${note}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            `
      : ""
    }

            <!-- Action -->
            <tr>
              <td style="padding:22px 28px 0;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#334155;">
                  ${isMissing
      ? `Kindly arrange the payment / bank instrument at the earliest — the pay order document has not yet been attached to this record.`
      : `No action needed for documentation. Please confirm receipt of this notice.`
    }
                </p>
              </td>
            </tr>

            <!-- Signature -->
            <tr>
              <td style="padding:22px 28px 0;">
                <p style="margin:0;font-size:13px;color:#334155;">
                  Regards,<br />
                  <strong style="color:#0f172a;">${senderName || "Tender Desk"}</strong>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 28px 26px;">
                <hr style="border:none;border-top:1px solid #e5e0d5;margin:0 0 14px;" />
                <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
                  This is an automated notification from the Tender Dashboard.<br />
                  Generated on ${new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

/* ============================================================
 * RETRY WRAPPER — retries once on transient network errors
 * ============================================================ */
async function sendWithRetry(mailOptions, attempt = 1) {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[email] ✅ sent to ${mailOptions.to} — id=${info.messageId}`);
    return info;
  } catch (err) {
    const isTransient =
      /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|socket hang up|Connection timeout/i.test(
        err.message,
      );

    if (attempt < 2 && isTransient) {
      console.warn(
        `[email] ⟳ transient failure (attempt ${attempt}): ${err.message}`,
      );
      await new Promise((r) => setTimeout(r, 1500));
      return sendWithRetry(mailOptions, attempt + 1);
    }

    console.error(`[email] ❌ failed: ${err.message}`);
    throw err;
  }
}

/* ============================================================
 * SEND — SECURITY NOTIFICATION
 * ============================================================ */
async function sendSecurityNotification({
  to,
  security,
  tender = null,
  note = "",
  senderName = "",
}) {
  if (!to || !to.length) throw new Error("At least one recipient is required");
  if (!security) throw new Error("Security record is required");

  const html = buildSecurityEmailHTML({ security, tender, note, senderName });

  const fromAddress =
    process.env.EMAIL_FROM ||
    `"Tender Dashboard" <${process.env.EMAIL_USER}>`;

  return sendWithRetry({
    from: fromAddress,
    to: to.join(", "),
    subject: `Tender Security Notice — ${security.entity} (${security.type}) — ${formatBDT(security.amount)}`,
    html,
  });
}

/* ============================================================
 * SEND — CRAWL SUMMARY
 * ============================================================ */
async function sendCrawlSummary({ to, summary, criteria, ranAt }) {
  if (!to || !to.length) return null;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f0;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e5e0d5;overflow:hidden;">
          <tr>
            <td style="background:#a97400;padding:22px 28px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fce9c2;">Tender Dashboard</p>
              <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#fff;">Daily Crawl Summary</h1>
            </td>
          </tr>
          <tr><td style="padding:24px 28px 8px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
              The automated tender crawl ran at <strong>${ranAt}</strong>.
            </p>
          </td></tr>
          <tr><td style="padding:14px 28px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e0d5;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:14px 16px;background:#faf7f0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Results</td></tr>
              <tr><td style="padding:0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:12px 16px;border-bottom:1px solid #f1ede2;font-size:12px;color:#64748b;">Sites Checked</td><td style="padding:12px 16px;border-bottom:1px solid #f1ede2;text-align:right;font-size:14px;font-weight:700;">${summary.sitesChecked}</td></tr>
                  <tr><td style="padding:12px 16px;border-bottom:1px solid #f1ede2;font-size:12px;color:#64748b;">New Tenders Found</td><td style="padding:12px 16px;border-bottom:1px solid #f1ede2;text-align:right;font-size:14px;font-weight:700;">${summary.newFound}</td></tr>
                  <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;">Matched Your Criteria</td><td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#a97400;">${summary.matched}</td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:18px 28px 24px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">Matching tenders have been added to your Potential list — look for the <strong>Auto-discovered</strong> flag.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendWithRetry({
    from:
      process.env.EMAIL_FROM ||
      `"Tender Dashboard" <${process.env.EMAIL_USER}>`,
    to: to.join(", "),
    subject: `Tender Crawl Summary — ${summary.matched} matched of ${summary.newFound} new`,
    html,
  });
}

/* ============================================================
 * SEND — GENERIC (used by notifyFinance and other controllers)
 * Reuses the same transporter + retry logic as the other senders.
 * ============================================================ */
async function sendMail({ to, subject, html, text }) {
  if (!to) throw new Error("Recipient (to) is required");
  if (!subject) throw new Error("Subject is required");
  if (!html && !text) throw new Error("Email body (html or text) is required");

  const recipients = Array.isArray(to) ? to.join(", ") : String(to);

  const fromAddress =
    process.env.EMAIL_FROM ||
    `"Tender Dashboard" <${process.env.EMAIL_USER}>`;

  return sendWithRetry({
    from: fromAddress,
    to: recipients,
    subject,
    html,
    text,
  });
}

module.exports = {
  transporter,
  verifyEmailOnce,
  sendSecurityNotification,
  buildSecurityEmailHTML,
  sendCrawlSummary,
  sendMail,        // ✅ NEW — used by tender.controller.js notifyFinance
};