const crypto = require("crypto");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const API = "https://api.razorpay.com/v1";

function razorpayConfigured(env = getEnv()) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
}

async function request(method, path, body) {
  const env = getEnv();
  if (!razorpayConfigured(env)) throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Online payments aren’t available right now. Please choose Cash on Delivery.");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ err: err.message, path }, "Razorpay unreachable");
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "We couldn’t reach the payment service. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status, path, error: data?.error }, "Razorpay request failed");
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", data?.error?.description || "The payment service returned an error. Please try again.");
  }
  return data;
}

// Amounts are integer paise, which is also what Razorpay expects.
function createRazorpayOrder({ amount, receipt, notes }) {
  return request("POST", "/orders", { amount, currency: "INR", receipt, notes });
}

function refundPayment({ paymentId, amount, notes }) {
  return request("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, speed: "normal", notes });
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

module.exports = { razorpayConfigured, createRazorpayOrder, refundPayment, verifyPaymentSignature, verifyWebhookSignature, hmacHex };
