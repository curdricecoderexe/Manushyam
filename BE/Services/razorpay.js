const crypto = require("crypto");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15000;
// Reads (and order creation, where a duplicate is harmless) are retried on network errors / 5xx / 429.
// Captures and refunds move money and are never retried blindly.
const RETRY_DELAYS_MS = [300, 1200];

function razorpayConfigured(env = getEnv()) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
}

// "live" | "test" | null — from the key id prefix (rzp_live_… / rzp_test_…).
function razorpayMode(env = getEnv()) {
  const m = /^rzp_(live|test)_/.exec(env.RAZORPAY_KEY_ID || "");
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retriable = (status) => status === 429 || status >= 500;

async function request(method, path, body, { retry = false } = {}) {
  const env = getEnv();
  if (!razorpayConfigured(env)) throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Online payments aren’t available right now. Please choose Cash on Delivery.");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const attempts = retry ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 1; ; attempt += 1) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < attempts) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }
      logger.error({ err: err.message, method, path }, "Razorpay unreachable");
      throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "We couldn’t reach the payment service. Please try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (attempt < attempts && retriable(res.status)) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
      continue;
    }
    logger.error({ status: res.status, method, path, error: data?.error }, "Razorpay request failed");
    const err = new AppError(502, "PAYMENT_PROVIDER_ERROR", data?.error?.description || "The payment service returned an error. Please try again.");
    err.providerStatus = res.status;
    err.providerCode = data?.error?.code;
    throw err;
  }
}

// Razorpay notes: at most 15 keys, string values up to 256 characters.
function cleanNotes(notes = {}) {
  return Object.fromEntries(
    Object.entries(notes)
      .filter(([, v]) => v !== undefined && v !== null)
      .slice(0, 15)
      .map(([k, v]) => [k, String(v).slice(0, 256)])
  );
}

// Amounts are integer paise, which is also what Razorpay expects.
function createRazorpayOrder({ amount, receipt, notes }) {
  return request("POST", "/orders", { amount, currency: "INR", receipt: String(receipt).slice(0, 40), notes: cleanNotes(notes) }, { retry: true });
}

function fetchPayment(paymentId) {
  return request("GET", `/payments/${encodeURIComponent(paymentId)}`, null, { retry: true });
}

// Every payment attempt made against one Razorpay order (failed, authorized, captured…).
async function fetchOrderPayments(razorpayOrderId) {
  const data = await request("GET", `/orders/${encodeURIComponent(razorpayOrderId)}/payments`, null, { retry: true });
  return Array.isArray(data?.items) ? data.items : [];
}

// Only needed when automatic capture is off in the Razorpay dashboard (or for late authorisations,
// which Razorpay leaves uncaptured). Uncaptured payments are auto-refunded by Razorpay after a few days.
function capturePayment({ paymentId, amount }) {
  return request("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency: "INR" });
}

function refundPayment({ paymentId, amount, notes, receipt }) {
  const speed = getEnv().RAZORPAY_REFUND_SPEED || "normal";
  return request("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, speed, notes: cleanNotes(notes), ...(receipt ? { receipt: String(receipt).slice(0, 40) } : {}) });
}

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(expectedHex, given) {
  if (typeof given !== "string" || !/^[a-f0-9]{64}$/i.test(given)) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(given, "hex"));
}

// Checkout handler signature: HMAC-SHA256(order_id|payment_id) with the key secret.
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_SECRET) return false;
  return safeEqual(hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

// Webhook signature: HMAC-SHA256 of the exact raw request body with the webhook secret.
function verifyWebhookSignature(rawBody, signature) {
  const env = getEnv();
  if (!env.RAZORPAY_WEBHOOK_SECRET || !Buffer.isBuffer(rawBody)) return false;
  return safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}

module.exports = {
  razorpayConfigured,
  razorpayMode,
  createRazorpayOrder,
  fetchPayment,
  fetchOrderPayments,
  capturePayment,
  refundPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  hmacHex,
};
