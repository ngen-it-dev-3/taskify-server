// scripts/test-email.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sendMail } = require('../src/utils/mailer');

(async () => {
  console.log('📧 Sending test email…');
  await sendMail({
    to: process.env.EMAIL_USER,   // send to self for test
    subject: 'Test email from NGEN IT CRM',
    html: `
      <div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#0F2D4A;">✅ Mailer is working</h2>
        <p>If you see this email, your SMTP config in <code>.env</code> is correct.</p>
        <p style="color:#64748B;font-size:12px;">Sent at ${new Date().toLocaleString()}</p>
      </div>
    `,
  });
  console.log('✅ Done');
  process.exit(0);
})().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});