const crypto = require("crypto");
const { NewsletterSubscriber } = require("../Models/Engagement");
const { sendMail } = require("./mailer");
const { enqueue } = require("./mailQueue");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");

const CONFIRM_TTL_MS = 3 * 24 * 3600 * 1000;
const RESEND_AFTER_MS = 2 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Unsubscribe links must keep working in every email ever sent, so they carry a signature over the
// address rather than a stored token. Derived from OTP_PEPPER with a purpose label.
function unsubscribeSignature(email) {
  return crypto.createHmac("sha256", getEnv().OTP_PEPPER).update(`newsletter-unsubscribe:${email.toLowerCase()}`).digest("base64url");
}

function unsubscribeUrl(email) {
  const e = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${getEnv().APP_URL}/newsletter/unsubscribe?e=${e}&t=${unsubscribeSignature(email)}`;
}

function verifyUnsubscribe(e, t) {
  let email;
  try {
    email = Buffer.from(String(e), "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  const expected = Buffer.from(unsubscribeSignature(email));
  const given = Buffer.from(String(t));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? email : null;
}

// Always answers the same way, so the form can't be used to discover who is subscribed.
async function subscribe({ email, source = "other" }) {
  const now = new Date();
  const existing = await NewsletterSubscriber.findOne({ email });
  if (existing?.status === "subscribed") return;
  if (existing?.status === "pending" && existing.lastSentAt && now - existing.lastSentAt < RESEND_AFTER_MS) return;

  const token = crypto.randomBytes(32).toString("base64url");
  await NewsletterSubscriber.updateOne(
    { email },
    {
      $set: { status: "pending", confirmTokenHash: sha256(token), confirmExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS), lastSentAt: now },
      $setOnInsert: { source },
    },
    { upsert: true }
  );
  const url = `${getEnv().APP_URL}/newsletter/confirm?token=${token}`;
  enqueue("newsletter-confirm", () =>
    sendMail({
      to: email,
      subject: "Confirm your ManushyaM subscription",
      heading: "One click to confirm",
      bodyHtml: `<p style="margin:0 0 16px">Please confirm you’d like Ayurvedic hair-care tips, new articles and offers from ManushyaM.</p>
<p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;background:#8E5A1C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px">Confirm subscription</a></p>
<p style="margin:0;color:#7A6C60">If you didn’t sign up, ignore this email and you won’t hear from us.</p>`,
      text: `Confirm your ManushyaM subscription: ${url}\n\nIf you didn't sign up, ignore this email.`,
      meta: { purpose: "newsletter-confirm", token },
    })
  );
}

async function confirm(token) {
  const sub = await NewsletterSubscriber.findOneAndUpdate(
    { confirmTokenHash: sha256(String(token)), status: "pending", confirmExpiresAt: { $gt: new Date() } },
    { $set: { status: "subscribed", confirmedAt: new Date() }, $unset: { confirmTokenHash: "", confirmExpiresAt: "", unsubscribedAt: "" } },
    { new: true }
  );
  if (!sub) throw AppError.badRequest("This confirmation link is invalid or has expired. Please subscribe again.");
  const unsub = unsubscribeUrl(sub.email);
  enqueue("newsletter-welcome", () =>
    sendMail({
      to: sub.email,
      subject: "Welcome to the ManushyaM circle",
      heading: "You’re subscribed",
      bodyHtml: `<p style="margin:0 0 16px">Thank you for joining us. Expect thoughtful Ayurvedic hair-care guides and the occasional offer — never spam.</p>
<p style="margin:0;font-size:12px;color:#7A6C60">Changed your mind? <a href="${unsub}" style="color:#8E5A1C">Unsubscribe</a> at any time.</p>`,
      text: `You're subscribed to ManushyaM. Unsubscribe any time: ${unsub}`,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      meta: { purpose: "newsletter-welcome", unsubscribeUrl: unsub },
    })
  );
  return sub;
}

async function unsubscribe({ e, t }) {
  const email = verifyUnsubscribe(e, t);
  if (!email) throw AppError.badRequest("This unsubscribe link is invalid.");
  await NewsletterSubscriber.updateOne({ email, status: { $ne: "unsubscribed" } }, { $set: { status: "unsubscribed", unsubscribedAt: new Date() }, $unset: { confirmTokenHash: "", confirmExpiresAt: "" } });
  return email;
}

module.exports = { subscribe, confirm, unsubscribe, unsubscribeUrl, verifyUnsubscribe };
