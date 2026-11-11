// src/utils/siteMailer.js
// Site-specific mailer for the Orvix Tender landing-page signup flow.
// Independent from ../utils/mailer.js (which serves Tender Dashboard notifications).

const nodemailer = require("nodemailer");

/* ============================================================
 * TRANSPORTER (same robust config as the main mailer)
 * ============================================================ */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: false,
  family: 4,
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
  tls: { rejectUnauthorized: false },
});

/* ============================================================
 * RETRY WRAPPER
 * ============================================================ */
async function sendWithRetry(mailOptions, attempt = 1) {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[site-email] ✅ sent to ${mailOptions.to} — id=${info.messageId}`);
    return info;
  } catch (err) {
    const isTransient =
      /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|socket hang up|Connection timeout/i.test(
        err.message
      );
    if (attempt < 2 && isTransient) {
      console.warn(`[site-email] ⟳ retry (${attempt}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500));
      return sendWithRetry(mailOptions, attempt + 1);
    }
    console.error(`[site-email] ❌ failed: ${err.message}`);
    throw err;
  }
}

/* ============================================================
 * TEMPLATE — WELCOME / TRIAL CREDENTIALS
 * ============================================================ */
function buildWelcomeEmailHTML({
  name,
  company,
  email,
  tempPassword,
  trialEndsAt,
  loginUrl,
  isAdmin,
}) {
  const trialEnd = new Date(trialEndsAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Welcome to ${company} on Orvix Tender</title>
</head>
<body style="margin:0;padding:0;background:#F4F7EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0F1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7EC;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,20,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#1B6B52;padding:26px 30px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;width:32px;height:32px;background:rgba(255,255,255,0.15);border-radius:8px;text-align:center;line-height:32px;color:#fff;font-weight:700;font-size:16px;">↗</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Orvix Tender</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 30px 8px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#0F1714;letter-spacing:-0.02em;">
                Welcome to ${company} 👋
              </h1>
              <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:#334155;">
                Hi ${name}, your workspace is ready. You're on a <strong>7-day free trial</strong>
                ending on <strong>${trialEnd}</strong>. You can invite more teammates at any time.
              </p>
              ${isAdmin
      ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#334155;">You're set as the workspace administrator for <strong>${company}</strong>.</p>`
      : `<p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#334155;">You've been added to the workspace <strong>${company}</strong> by your admin.</p>`
    }

              <!-- Credentials card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px solid #E6EBDD;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:14px 18px;background:#F7FAF0;border-bottom:1px solid #E6EBDD;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5E6D66;">
                    Your login details
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px;">
                    <p style="margin:0 0 10px;font-size:13px;color:#5E6D66;">Email</p>
                    <p style="margin:0 0 18px;font-size:15px;font-weight:600;color:#0F1714;font-family:'SF Mono',Menlo,Consolas,monospace;">${email}</p>

                    <p style="margin:0 0 10px;font-size:13px;color:#5E6D66;">Temporary password</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#1B6B52;font-family:'SF Mono',Menlo,Consolas,monospace;background:#F2F5EC;padding:10px 14px;border-radius:8px;display:inline-block;letter-spacing:0.05em;">
                      ${tempPassword}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="border-radius:10px;background:#1B6B52;">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:14px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Sign in to your workspace →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#5E6D66;">
                For security, please change your password right after your first login.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:26px 30px 30px;">
              <hr style="border:none;border-top:1px solid #E6EBDD;margin:0 0 16px;" />
              <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6;">
                You're receiving this because a workspace was created for ${email}.<br />
                If this wasn't you, you can safely ignore this email.
              </p>
              <p style="margin:14px 0 0;font-size:12px;color:#94A3B8;">
                © ${new Date().getFullYear()} Orvix Tender
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ============================================================
 * SEND — WELCOME / TRIAL CREDENTIALS
 * ============================================================ */
async function sendWelcomeEmail({
  to,
  name,
  company,
  tempPassword,
  trialEndsAt,
  loginUrl,
  isAdmin = false,
}) {
  if (!to) throw new Error("Recipient email (to) is required");
  if (!tempPassword) throw new Error("Temporary password is required");

  const html = buildWelcomeEmailHTML({
    name,
    company,
    email: to,
    tempPassword,
    trialEndsAt,
    loginUrl: loginUrl || process.env.LOGIN_URL || "http://localhost:3000/login",
    isAdmin,
  });

  const fromAddress =
    process.env.EMAIL_FROM ||
    `"Orvix Tender" <${process.env.EMAIL_USER}>`;

  return sendWithRetry({
    from: fromAddress,
    to,
    subject: `Welcome to ${company} — your trial is ready`,
    html,
  });
}

module.exports = {
  transporter,
  sendMail: sendWithRetry,
  sendWelcomeEmail,
  buildWelcomeEmailHTML,
};