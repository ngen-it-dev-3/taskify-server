// src/services/rfq/rfq.email.templates.js

const BRAND = {
  primary: '#0F2D4A',
  gold: '#A06126',
  light: '#FDFBF7',
  border: '#EBE6DF',
  text: '#1E293B',
  muted: '#64748B',
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// 1. Salesperson Notification
// ============================================================
function assignedToSalesmanTemplate({ rfq, assignedTo, assignedBy, notes, priority }) {
  const productRows = (rfq.products || [])
    .map(
      (p, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:12px;">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">
          <strong>${escapeHtml(p.name)}</strong>
          ${p.sku ? `<div style="color:${BRAND.muted};font-size:11px;margin-top:2px;">SKU: ${escapeHtml(p.sku)}</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;text-align:center;font-weight:600;">${p.qty}</td>
      </tr>`
    )
    .join('');

  const priorityColor =
    priority === 'urgent' ? '#DC2626'
    : priority === 'high' ? '#EA580C'
    : priority === 'low' ? '#64748B'
    : '#2563EB';

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.light};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
    <div style="background:${BRAND.primary};padding:24px 32px;">
      <div style="color:${BRAND.gold};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">NGEN IT · CRM</div>
      <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">New RFQ Assigned To You</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Hi <strong>${escapeHtml(assignedTo)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${BRAND.muted};">
        A new Request for Quotation has been assigned to you by <strong>${escapeHtml(assignedBy || 'CRM System')}</strong>.
      </p>
      <div style="background:${BRAND.light};border:1px solid ${BRAND.border};border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:${BRAND.muted};width:140px;">RFQ Number</td><td style="padding:6px 0;font-weight:700;color:${BRAND.primary};font-family:monospace;">${escapeHtml(rfq.rfqNumber)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Company</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(rfq.company)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Country</td><td style="padding:6px 0;">${escapeHtml(rfq.country)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Contact</td><td style="padding:6px 0;">${escapeHtml(rfq.contactName)} &lt;${escapeHtml(rfq.email)}&gt;</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Priority</td><td style="padding:6px 0;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${priorityColor}22;color:${priorityColor};font-size:11px;font-weight:700;text-transform:uppercase;">${escapeHtml(priority || 'normal')}</span></td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Aging</td><td style="padding:6px 0;color:#DC2626;font-weight:600;">⏰ ${rfq.agingDays} day${rfq.agingDays === 1 ? '' : 's'}</td></tr>
        </table>
      </div>
      <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:1px;color:${BRAND.primary};text-transform:uppercase;">Requested Items</h2>
      <table style="width:100%;border:1px solid ${BRAND.border};border-radius:8px;border-collapse:collapse;margin-bottom:24px;overflow:hidden;">
        <thead><tr style="background:${BRAND.light};">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;width:40px;">SL</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;width:60px;">Qty</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
      </table>
      ${notes ? `<div style="background:#FFF8EE;border-left:3px solid ${BRAND.gold};padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:${BRAND.gold};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Instructions</div>
        <div style="font-size:13px;color:${BRAND.text};line-height:1.5;">${escapeHtml(notes)}</div>
      </div>` : ''}
      <div style="text-align:center;margin:32px 0 8px;">
        <a href="${FRONTEND_URL}/crm/rfq?id=${rfq._id}" style="display:inline-block;background:${BRAND.gold};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;">Open RFQ in CRM →</a>
      </div>
    </div>
    <div style="background:${BRAND.light};padding:16px 32px;text-align:center;font-size:11px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};">
      Sent automatically by NGEN IT CRM
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// 2. Client Acknowledgment
// ============================================================
function assignedToClientTemplate({ rfq, assignedTo }) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.light};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
    <div style="background:${BRAND.primary};padding:24px 32px;">
      <div style="color:${BRAND.gold};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">NGEN IT</div>
      <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">Your RFQ Has Been Assigned</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Dear <strong>${escapeHtml(rfq.contactName)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${BRAND.muted};">
        Thank you for your Request for Quotation. Your request has been assigned to our sales representative.
      </p>
      <div style="background:${BRAND.light};border:1px solid ${BRAND.border};border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:${BRAND.muted};width:140px;">Reference</td><td style="padding:6px 0;font-weight:700;color:${BRAND.primary};font-family:monospace;">${escapeHtml(rfq.rfqNumber)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Your Representative</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(assignedTo)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.muted};">Items Requested</td><td style="padding:6px 0;">${rfq.products?.length || 0} item${(rfq.products?.length || 0) === 1 ? '' : 's'}</td></tr>
        </table>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.muted};">
        If you have any urgent questions, please reply to this email.
      </p>
    </div>
    <div style="background:${BRAND.light};padding:16px 32px;text-align:center;font-size:11px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};">
      © ${new Date().getFullYear()} NGEN IT · All rights reserved
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  assignedToSalesmanTemplate,
  assignedToClientTemplate,
};