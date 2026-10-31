const nodemailer = require("nodemailer");
const { getEnv } = require("../Config/runtime");
const { logger } = require("../Utils/logger");

// In tests and in dev without SMTP, emails are captured here instead of being sent.
const outbox = [];
let transport = null;

function getTransport() {
  if (transport) return transport;
  const env = getEnv();
  transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Table-based, inline-styled layout so it renders in Gmail/Outlook.
function layout({ heading, bodyHtml }) {
  return `<!doctype html><html><body style="margin:0;background:#FBF6EE;font-family:Arial,Helvetica,sans-serif;color:#4A3F36">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6EE;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FDF9F3;border:1px solid #E6D5BD;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-family:Georgia,serif;font-size:26px;color:#2A1608">ManushyaM</td></tr>
<tr><td style="padding:8px 32px 0;font-family:Georgia,serif;font-size:22px;color:#2A1608">${escapeHtml(heading)}</td></tr>
<tr><td style="padding:12px 32px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #E6D5BD;font-size:12px;color:#7A6C60">ManushyaM Wellness Pvt. Ltd. · Bengaluru, India</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendMail({ to, subject, heading, bodyHtml, text, meta, attachments, replyTo, headers }) {
  const env = getEnv();
  const message = { from: env.MAIL_FROM, to, subject, text, html: layout({ heading, bodyHtml }), ...(attachments ? { attachments } : {}), ...(replyTo ? { replyTo } : {}), ...(headers ? { headers } : {}) };
  if (env.isTest || !env.SMTP_URL) {
    outbox.push({ ...message, meta });
    if (outbox.length > 100) outbox.shift();
    if (!env.isTest) logger.info({ subject, meta }, "Email captured (no SMTP configured)");
    if (env.isTest) return;
  }
  try {
    await getTransport().sendMail(message);
  } catch (err) {
    // Never let an email failure break the request; it is logged for follow-up.
    logger.error({ err: err.message, subject }, "Email send failed");
  }
}

const OTP_COPY = {
  register: { subject: "Your ManushyaM verification code", heading: "Verify your email", lead: "Use this code to finish creating your account." },
  login: { subject: "Your ManushyaM sign-in code", heading: "Confirm it’s you", lead: "Use this code to finish signing in." },
  reset: { subject: "Reset your ManushyaM password", heading: "Reset your password", lead: "Use this code to set a new password." },
  cod: { subject: "Confirm your ManushyaM Cash on Delivery order", heading: "Confirm your order", lead: "Enter this code at checkout to confirm your Cash on Delivery order." },
};

function sendOtpEmail({ to, code, purpose }) {
  const copy = OTP_COPY[purpose];
  const bodyHtml = `<p style="margin:0 0 16px">${copy.lead}</p>
<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:32px;letter-spacing:8px;color:#7A3A12">${escapeHtml(code)}</p>
<p style="margin:0;color:#7A6C60">This code expires in 10 minutes. If you didn’t request it, you can ignore this email — your account is safe.</p>`;
  return sendMail({ to, subject: copy.subject, heading: copy.heading, bodyHtml, text: `${copy.lead}\n\nCode: ${code}\n\nIt expires in 10 minutes.`, meta: { purpose, code } });
}

function sendAccountExistsEmail({ to }) {
  const url = `${getEnv().APP_URL}/login`;
  return sendMail({
    to,
    subject: "You already have a ManushyaM account",
    heading: "You already have an account",
    bodyHtml: `<p style="margin:0 0 16px">Someone tried to create a new account with this email. If it was you, simply <a href="${url}" style="color:#8E5A1C">sign in</a> or reset your password.</p>`,
    text: `You already have a ManushyaM account. Sign in at ${url}`,
    meta: { purpose: "account-exists" },
  });
}

function sendPasswordChangedEmail({ to }) {
  return sendMail({
    to,
    subject: "Your ManushyaM password was changed",
    heading: "Password changed",
    bodyHtml: `<p style="margin:0">Your password was just changed and all other sessions were signed out. If this wasn’t you, contact care@manushyam.com immediately.</p>`,
    text: "Your ManushyaM password was changed. If this wasn't you, contact care@manushyam.com.",
    meta: { purpose: "password-changed" },
  });
}

function sendAccountDeletedEmail({ to, anonymizedOrders }) {
  const kept = anonymizedOrders
    ? `<p style="margin:0 0 16px">We are required to keep GST invoices for ${anonymizedOrders} past order${anonymizedOrders === 1 ? "" : "s"}. They no longer carry your name, email, phone or street address.</p>`
    : "";
  return sendMail({
    to,
    subject: "Your ManushyaM account has been deleted",
    heading: "Account deleted",
    bodyHtml: `<p style="margin:0 0 16px">As you asked, your ManushyaM account and the personal data linked to it have been deleted.</p>${kept}<p style="margin:0;color:#7A6C60">This is the last email you will get from us about this account. If you didn’t ask for this, contact care@manushyam.com.</p>`,
    text: `Your ManushyaM account and the personal data linked to it have been deleted.${anonymizedOrders ? ` GST invoices for ${anonymizedOrders} past order(s) are kept without your personal details.` : ""}`,
    meta: { purpose: "account-deleted" },
  });
}

module.exports = { sendMail, sendOtpEmail, sendAccountExistsEmail, sendPasswordChangedEmail, sendAccountDeletedEmail, outbox, escapeHtml };
