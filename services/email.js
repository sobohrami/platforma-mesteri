const nodemailer = require('nodemailer');
const config = require('../config');

function getTransport() {
  if (!config.smtp.host) return null;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendMail(to, subject, text, html) {
  const t = getTransport();
  if (!t) {
    console.warn('[email] SMTP neconfigurat, skip:', to, subject);
    return { skipped: true };
  }
  await t.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html: html || text,
  });
  return { ok: true };
}

module.exports = { sendMail, getTransport };
