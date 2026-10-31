// src/services/quotation/quotation.pdf.template.js

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
  return Number(n || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function quotationHtmlTemplate({ quotation }) {
  const q = quotation;
  const currency = q.currencySymbol || '৳';

  // 1. Product Line Items
  const products = (q.lines || []).filter(
    (l) => l.type !== 'fixed' && l.name?.trim()
  );

  const productRows = products
    .map((l, i) => {
      const unitPrice = l.principalCost || 0;
      const total = unitPrice * (l.qty || 1);

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E5DFD3;color:#64748B;font-size:12px;text-align:center;">${i + 1}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E5DFD3;color:#1E293B;font-size:12.5px;font-weight:500;">
            ${escapeHtml(l.name)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E5DFD3;color:#1E293B;font-size:12.5px;text-align:center;font-family:monospace;">${l.qty || 1}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E5DFD3;color:#1E293B;font-size:12.5px;text-align:right;font-family:monospace;">${currency}${fmtMoney(unitPrice)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E5DFD3;color:#1E293B;font-size:12.5px;text-align:right;font-family:monospace;font-weight:600;">${currency}${fmtMoney(total)}</td>
        </tr>`;
    })
    .join('');

  // 2. Terms
  const termRows = (q.terms || [])
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 0;color:#0F2D4A;font-size:12px;font-weight:700;vertical-align:top;width:120px;">${escapeHtml(t.label)}</td>
        <td style="padding:8px 0;color:#475569;font-size:12px;vertical-align:top;">${escapeHtml(t.value)}</td>
      </tr>`
    )
    .join('');

  // 3. Totals
  const subtotal = q.totals?.subTotal || 0;
  const gst = q.totals?.taxVatGst || 0;
  const grand = q.totals?.grandTotal || 0;

  // 4. Date Formatter
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // 5. Dynamic Address Builder
  const addressParts = [
    q.client?.address,
    q.client?.city,
    q.client?.country,
    q.client?.zipCode
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '—';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quotation ${escapeHtml(q.pqNumber)}</title>
  <style>
    /* ⭐ Force Full Page (Remove A4 Margins) */
    @page { margin: 0; }
    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body style="font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1E293B;background:#FFFFFF;width:100%;">

  <!-- ================= LETTERHEAD ================= -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F2D4A;padding:24px 32px;">
    <tr>
      <td style="vertical-align:middle;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:14px;">
              <div style="width:56px;height:56px;background:#A06126;border-radius:8px;color:#FFFFFF;font-weight:700;font-size:22px;text-align:center;line-height:56px;">NG</div>
            </td>
            <td style="vertical-align:middle;">
              <div style="color:#FFFFFF;font-weight:700;font-size:20px;line-height:1.2;">NGEN IT LIMITED</div>
              <div style="color:rgba(255,255,255,0.65);font-size:11.5px;letter-spacing:0.5px;margin-top:3px;">Facing Next Generation IT</div>
            </td>
          </tr>
        </table>
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="color:#FFFFFF;font-family:Georgia,serif;font-size:24px;font-weight:600;letter-spacing:0.5px;">PRICE QUOTATION</div>
      </td>
    </tr>
  </table>

  <!-- ================= BILL TO + QUOTE DETAILS ================= -->
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 32px 20px;border-bottom:1px solid #F0EBE3;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        <div style="color:#A06126;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px;">BILL TO</div>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;width:110px;">Company</td>
            <td style="color:#0F2D4A;font-size:13px;font-weight:700;padding:5px 0;">${escapeHtml(q.client?.company || '—')}</td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">Contact</td>
            <td style="color:#0F2D4A;font-size:12.5px;padding:5px 0;">
              ${escapeHtml(q.client?.contactName || '—')}
              ${q.client?.designation ? `<div style="color:#64748B;font-size:11px;margin-top:2px;">${escapeHtml(q.client.designation)}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">Email / Phone</td>
            <td style="color:#0F2D4A;font-size:12px;font-family:monospace;padding:5px 0;">
              ${escapeHtml(q.client?.email || '—')}
              ${q.client?.phone ? `<div style="color:#64748B;font-size:11px;margin-top:2px;">${escapeHtml(q.client.phone)}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">Address</td>
            <td style="color:#0F2D4A;font-size:12.5px;padding:5px 0;line-height:1.4;">
              ${escapeHtml(fullAddress)}
            </td>
          </tr>
        </table>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:32px;">
        <div style="color:#A06126;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px;">QUOTE DETAILS</div>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;width:110px;">PQ #</td>
            <td style="color:#0F2D4A;font-size:12.5px;font-weight:700;font-family:monospace;padding:5px 0;">${escapeHtml(q.pqNumber)}</td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">Date</td>
            <td style="color:#0F2D4A;font-size:12.5px;font-family:monospace;padding:5px 0;">${formatDate(q.createdAt)}</td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">PQR #</td>
            <td style="color:#0F2D4A;font-size:12.5px;font-family:monospace;padding:5px 0;">${escapeHtml(q.pqrNumber || '—')}</td>
          </tr>
          <tr>
            <td style="color:#A0AEC0;font-size:12px;padding:5px 0;">RFQ Ref</td>
            <td style="color:#0F2D4A;font-size:12.5px;font-family:monospace;padding:5px 0;">${escapeHtml(q.rfqNumber || '—')}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ================= LINE ITEMS ================= -->
  <div style="padding:28px 32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="border-bottom:1px solid #E5DFD3;">
          <th style="padding:10px 12px;text-align:center;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;width:40px;">SI</th>
          <th style="padding:10px 12px;text-align:left;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">PRODUCT NAME</th>
          <th style="padding:10px 12px;text-align:center;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;width:60px;">QTY</th>
          <th style="padding:10px 12px;text-align:right;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;width:110px;">UNIT PRICE</th>
          <th style="padding:10px 12px;text-align:right;color:#64748B;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;width:110px;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${productRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94A3B8;font-style:italic;">No line items</td></tr>'}
      </tbody>
    </table>

    <!-- Totals -->
    <table cellpadding="0" cellspacing="0" style="margin-top:24px;margin-left:auto;width:300px;">
      <tr>
        <td style="padding:6px 0;color:#475569;font-size:12.5px;">Sub Total</td>
        <td style="padding:6px 0;color:#0F2D4A;font-size:12.5px;text-align:right;font-family:monospace;">${currency}${fmtMoney(subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#475569;font-size:12.5px;">GST / VAT (15%) <span style="color:#059669;">(added)</span></td>
        <td style="padding:6px 0;color:#0F2D4A;font-size:12.5px;text-align:right;font-family:monospace;">${currency}${fmtMoney(gst)}</td>
      </tr>
      <tr>
        <td colspan="2" style="border-top:2px solid #0F2D4A;padding-top:10px;"></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#0F2D4A;font-size:14px;font-weight:700;">Grand Total</td>
        <td style="padding:6px 0;color:#A06126;font-size:20px;font-weight:700;text-align:right;font-family:monospace;">${currency}${fmtMoney(grand)}</td>
      </tr>
    </table>
  </div>

  <!-- ================= TERMS ================= -->
  ${termRows ? `
  <div style="padding:20px 32px;border-top:1px solid #F0EBE3;">
    <div style="color:#A06126;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:10px;">TERMS &amp; CONDITIONS</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${termRows}
    </table>
  </div>` : ''}

  <!-- ================= AUTHORIZED BRANDS ================= -->
  <div style="padding:20px 32px;border-top:1px solid #F0EBE3;">
    <div style="color:#A06126;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:10px;text-align:center;">AUTHORIZED BRANDS</div>
    <div style="display:flex;justify-content:center;gap:20px;align-items:center;opacity:0.7;">
      <!-- Replace text with <img src="..." /> if you have actual brand logos -->
      <span style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#475569;">Dell</span>
      <span style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#475569;">HP</span>
      <span style="font-family:Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#475569;">Lenovo</span>
      <span style="font-family:Verdana,sans-serif;font-size:16px;font-weight:bold;color:#475569;">Cisco</span>
      <span style="font-family:Impact,sans-serif;font-size:16px;font-weight:bold;color:#475569;">APC</span>
    </div>
  </div>

  <!-- ================= SIGNATURE ================= -->
  <div style="padding:20px 32px;border-top:1px solid #F0EBE3;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:bottom;">
          <div style="color:#0F2D4A;font-size:13.5px;font-weight:700;">${escapeHtml(q.crmManager || 'Authorized Signatory')}</div>
          <div style="color:#64748B;font-size:11.5px;margin-top:3px;">Sales Executive, Bangladesh</div>
        </td>
        <td style="vertical-align:bottom;text-align:right;color:#64748B;font-size:10.5px;line-height:1.6;">
          NGEN IT Limited · Reg. No. C-193116/2024<br />
          Dhaka, Bangladesh · www.ngenit.com
        </td>
      </tr>
    </table>
  </div>

</body>
</html>`;
}

module.exports = { quotationHtmlTemplate };