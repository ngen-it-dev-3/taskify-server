// src/services/quotation/quotation.email.templates.js

const BRAND = {
  primary: '#0F2D4A',
  gold: '#A06126',
  light: '#FDFBF7',
  border: '#EBE6DF',
  text: '#1E293B',
  muted: '#64748B',
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ============================================================
// CLIENT EMAIL — sent to customer
// ============================================================
function quotationSentTemplate({ quotation, hasAttachment }) {
  const q = quotation;
  const lines = (q.lines || [])
    .filter((l) => l.type !== 'fixed' && l.name?.trim() && l.principalCost > 0)
    .map(
      (l, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">
          <strong>${escapeHtml(l.name)}</strong>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;text-align:center;">${l.qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;text-align:right;font-family:monospace;">${q.currencySymbol || '৳'}${fmtMoney((l.principalCost || 0) * (l.qty || 0) * 1.085)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.light};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
    <div style="background:${BRAND.primary};padding:24px 32px;">
      <div style="color:${BRAND.gold};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">NGEN IT LIMITED</div>
      <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">Your Quotation is Ready</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;">Dear <strong>${escapeHtml(q.client?.contactName || 'Sir/Madam')}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};">
        Please find your quotation <strong>${escapeHtml(q.pqNumber)}</strong> below.
        ${hasAttachment ? 'A PDF copy is attached to this email.' : ''}
        ${q.validUntil ? `Valid until <strong>${new Date(q.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.` : ''}
      </p>
      <table style="width:100%;border:1px solid ${BRAND.border};border-radius:8px;border-collapse:collapse;margin-bottom:24px;overflow:hidden;">
        <thead><tr style="background:${BRAND.light};">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">SI</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Total</th>
        </tr></thead>
        <tbody>${lines || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94A3B8;font-style:italic;">No items</td></tr>'}</tbody>
      </table>
      <div style="text-align:right;padding:16px;background:${BRAND.light};border-radius:8px;">
        <div style="color:${BRAND.muted};font-size:12px;">Grand Total</div>
        <div style="color:${BRAND.gold};font-size:24px;font-weight:700;font-family:monospace;">${q.currencySymbol || '৳'}${fmtMoney(q.totals?.grandTotal || 0)}</div>
      </div>
    </div>
    <div style="background:${BRAND.light};padding:16px 32px;text-align:center;font-size:11px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};">
      NGEN IT Limited · Reg. No. C-193116/2024 · Dhaka, Bangladesh · www.ngenit.com
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// ADMIN EMAIL — internal notification
// ============================================================
function quotationAdminTemplate({ quotation, sentTo, sentBy }) {
  const q = quotation;
  const lines = (q.lines || [])
    .filter((l) => l.type !== 'fixed' && l.name?.trim() && l.principalCost > 0)
    .map(
      (l, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:12.5px;">${escapeHtml(l.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:12.5px;text-align:center;">${l.qty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:12.5px;text-align:right;font-family:monospace;">${q.currencySymbol || '৳'}${fmtMoney((l.principalCost || 0) * (l.qty || 0) * 1.085)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.light};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
    <div style="background:${BRAND.gold};padding:20px 32px;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">INTERNAL NOTIFICATION</div>
      <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Quotation Sent to Client</h1>
    </div>
    <div style="padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:${BRAND.muted};width:130px;">PQ #</td><td style="padding:8px 0;font-weight:700;font-family:monospace;color:${BRAND.primary};">${escapeHtml(q.pqNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">RFQ Ref</td><td style="padding:8px 0;font-family:monospace;">${escapeHtml(q.rfqNumber || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Client</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(q.client?.company || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Sent To</td><td style="padding:8px 0;">${escapeHtml(sentTo || q.client?.email || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Sent By</td><td style="padding:8px 0;">${escapeHtml(sentBy || 'CRM System')}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Sent At</td><td style="padding:8px 0;font-family:monospace;">${new Date().toLocaleString('en-GB')}</td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Grand Total</td><td style="padding:8px 0;font-weight:700;color:${BRAND.gold};font-family:monospace;font-size:15px;">${q.currencySymbol || '৳'}${fmtMoney(q.totals?.grandTotal || 0)}</td></tr>
      </table>

      <div style="margin-top:20px;padding-top:20px;border-top:1px solid ${BRAND.border};">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${BRAND.muted};text-transform:uppercase;margin-bottom:10px;">Items Sent</div>
        <table width="100%" style="border-collapse:collapse;">
          <thead><tr style="background:${BRAND.light};">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">SI</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Product</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Qty</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:${BRAND.muted};text-transform:uppercase;">Total</th>
          </tr></thead>
          <tbody>${lines || '<tr><td colspan="4" style="padding:15px;text-align:center;color:#94A3B8;font-style:italic;">No items</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div style="background:${BRAND.light};padding:14px 32px;text-align:center;font-size:11px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};">
      NGEN IT CRM · Automated notification
    </div>
  </div>
</body>
</html>`;
}

module.exports = { quotationSentTemplate, quotationAdminTemplate };