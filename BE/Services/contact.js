const { ContactMessage } = require("../Models/Engagement");
const { sendMail, escapeHtml } = require("./mailer");
const { enqueue } = require("./mailQueue");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const SUBJECT_LABELS = {
  orders: "Orders & shipping",
  payments: "Payments & refunds",
  products: "Products & usage",
  returns: "Returns & cancellation",
  account: "Account",
  collaboration: "Collaboration",
  other: "Something else",
};

// Cloudflare Turnstile server-side check. Skipped when no secret is configured (local dev).
async function verifyTurnstile(token, ip) {
  const secret = getEnv().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: String(token), ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return data.success === true;
  } catch (err) {
    logger.warn({ err: err.message }, "Turnstile verification unavailable");
    return false;
  }
}

async function submitContact({ fullName, email, phone, subject, message }, { ip, userAgent }) {
  const doc = await ContactMessage.create({ name: fullName, email, phone, subject, message, userAgent: String(userAgent ?? "").slice(0, 200) });
  const env = getEnv();
  const label = SUBJECT_LABELS[subject];
  const html = (s) => escapeHtml(s).replace(/\n/g, "<br>");

  enqueue("contact-support", () =>
    sendMail({
      to: env.SUPPORT_EMAIL,
      replyTo: email,
      subject: `[Contact] ${label} — ${fullName}`,
      heading: "New contact message",
      bodyHtml: `<p style="margin:0 0 12px"><strong>${html(fullName)}</strong> &lt;${html(email)}&gt;${phone ? ` · +91 ${html(phone)}` : ""}</p>
<p style="margin:0 0 12px;color:#7A6C60">Topic: ${label}</p>
<p style="margin:0;white-space:pre-wrap">${html(message)}</p>`,
      text: `${fullName} <${email}>${phone ? ` +91 ${phone}` : ""}\nTopic: ${label}\n\n${message}`,
      meta: { purpose: "contact-support", id: String(doc._id), ip },
    })
  );
  enqueue("contact-ack", () =>
    sendMail({
      to: email,
      subject: "We’ve received your message",
      heading: "Thank you for reaching out",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${html(fullName.split(" ")[0])}, we’ve received your message about <strong>${label.toLowerCase()}</strong> and will reply within one working day.</p>
<p style="margin:0;color:#7A6C60">For anything urgent, WhatsApp us on +91 78296 00018.</p>`,
      text: `We've received your message about ${label.toLowerCase()} and will reply within one working day.`,
      meta: { purpose: "contact-ack" },
    })
  );
  return doc;
}

function assertHuman(ok) {
  if (!ok) throw new AppError(400, "CAPTCHA_FAILED", "Please complete the verification and try again.");
}

module.exports = { verifyTurnstile, submitContact, assertHuman, SUBJECT_LABELS };
