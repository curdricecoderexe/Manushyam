const { AuditLog } = require("../Models/AuditLog");
const { User } = require("../Models/User");
const { logger } = require("../Utils/logger");

const SECRET_KEY = /password|secret|token|otp|signature|^code$/i;
const MAX_STRING = 400;

// Copies a value for storage: secrets are masked, long strings (article HTML) are cut, depth is bounded.
function scrub(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)` : value;
  if (typeof value !== "object") return value;
  if (typeof value.toHexString === "function") return value.toHexString();
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "__v" || k === "updatedAt") continue;
    out[k] = SECRET_KEY.test(k) ? "••••" : scrub(v, depth + 1);
  }
  return out;
}

const plain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject({ depopulate: true }) : doc);

// Top-level fields that differ between two snapshots, as { before, after } holding only those fields.
function diff(before, after) {
  const a = scrub(plain(before)) ?? {};
  const b = scrub(plain(after)) ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = { before: {}, after: {} };
  for (const k of keys) {
    if (k === "_id" || k === "createdAt") continue;
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    if (k in a) out.before[k] = a[k];
    if (k in b) out.after[k] = b[k];
  }
  return out;
}

// Controllers describe the change; the audit middleware writes it once the response succeeds.
//   audit(req, { action: "coupon.update", resourceId, before: doc, after: doc, summary })
function audit(req, entry) {
  req.auditEntries ??= [];
  req.auditEntries.push(entry);
}

const ACTION_VERB = { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

// Fallback description for writes a controller didn't describe: "/api/admin/hero-slides/:id" → hero-slides.update.
function inferEntry(req) {
  const segments = req.originalUrl.split("?")[0].split("/").filter(Boolean).slice(1); // drop "api"
  if (segments[0] === "admin") segments.shift();
  const isId = (s) => /^[a-f\d]{24}$/i.test(s);
  const resource = segments.find((s) => !isId(s)) ?? "unknown";
  const resourceId = segments.find(isId);
  const tail = segments.at(-1);
  const verb = tail && !isId(tail) && tail !== resource ? tail : ACTION_VERB[req.method] ?? req.method.toLowerCase();
  return { action: `${resource}.${verb}`, resource, resourceId, after: req.method === "DELETE" ? undefined : req.body };
}

async function writeEntries(req, res) {
  const actor = await User.findById(req.user.id).select("email role").lean();
  const entries = req.auditEntries?.length ? req.auditEntries : [inferEntry(req)];
  const docs = entries.map((e) => {
    const changed = e.before !== undefined && e.after !== undefined ? diff(e.before, e.after) : { before: scrub(plain(e.before)), after: scrub(plain(e.after)) };
    return {
      actor: req.user.id,
      actorEmail: actor?.email,
      actorRole: req.user.role,
      action: e.action,
      resource: e.resource ?? e.action.split(".")[0],
      resourceId: e.resourceId ? String(e.resourceId) : undefined,
      summary: e.summary,
      before: changed.before,
      after: changed.after,
      method: req.method,
      path: req.originalUrl.split("?")[0].slice(0, 200),
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 300),
      requestId: req.id,
    };
  });
  await AuditLog.insertMany(docs);
}

// Writes the log entry for every successful staff/admin write under the audited paths.
// Runs after the response has been sent, so a logging failure never fails the request (it is logged instead).
const AUDITED = [/^\/api\/admin\//, /^\/api\/chat\/[a-f\d]{24}\/(accept|close|reopen)$/i];
const pendingWrites = new Set();

function auditTrail(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  if (!AUDITED.some((rx) => rx.test(path))) return next();
  res.on("finish", () => {
    if (!req.user || !["staff", "admin"].includes(req.user.role) || res.statusCode >= 400) return;
    const job = writeEntries(req, res)
      .catch((err) => logger.error({ err: err.message, path }, "Audit log write failed"))
      .finally(() => pendingWrites.delete(job));
    pendingWrites.add(job);
  });
  return next();
}

// Tests wait for log entries written after the response.
async function flushAudit() {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

module.exports = { audit, auditTrail, flushAudit, diff, scrub };
