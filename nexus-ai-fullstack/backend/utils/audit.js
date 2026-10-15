const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const nodemailer = require('nodemailer');

function clientIp(req) {
  // Do not trust arbitrary X-Forwarded-For headers unless Express proxy trust is configured intentionally.
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}
async function logActivity(req, data) {
  try { return await Activity.create({ ...data, ipAddress: clientIp(req) }); }
  catch (err) { console.error('Could not save activity log:', err.message); return null; }
}
async function notifyAdmin({ type, title, message, email = '' }) {
  try {
    const record = await Notification.create({ type, title, message, email });
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, ADMIN_NOTIFICATION_EMAIL } = process.env;
    if (SMTP_HOST && SMTP_USER && SMTP_PASS && ADMIN_NOTIFICATION_EMAIL) {
      try {
        const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: String(SMTP_SECURE).toLowerCase() === 'true', auth: { user: SMTP_USER, pass: SMTP_PASS } });
        await transport.sendMail({ from: SMTP_USER, to: ADMIN_NOTIFICATION_EMAIL, subject: `[NEXUS AI] ${title}`, text: `${message}${email ? `\nAccount email: ${email}` : ''}\nTime: ${new Date().toISOString()}` });
        record.emailStatus = 'sent'; await record.save();
      } catch (err) { record.emailStatus = 'failed'; await record.save(); console.error('Admin notification email failed:', err.message); }
    }
    return record;
  } catch (err) { console.error('Could not save admin notification:', err.message); return null; }
}
module.exports = { logActivity, notifyAdmin, clientIp };
