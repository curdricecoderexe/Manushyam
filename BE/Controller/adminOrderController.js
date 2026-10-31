const { Order } = require("../Models/Order");
const { DeliverySettings, PincodeRule, getDeliverySettings } = require("../Models/Delivery");
const orders = require("../Services/orders");
const { shiprocketConfigured } = require("../Services/shiprocket");
const { sendInvoice } = require("./orderController");
const { audit } = require("../Services/audit");
const { parseCsv, toCsv } = require("../Services/csv");
const { schemas } = require("../Validators/orders");
const { INDIA_STATES } = require("../Data/indiaStates");
const { istDay } = require("../Services/salesAnalytics");
const { AppError } = require("../Utils/AppError");

const PAGE_SIZE = 25;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function loadOrder(id) {
  const order = await Order.findById(id);
  if (!order) throw AppError.notFound("Order not found");
  return order;
}

async function listOrders(req, res) {
  const { status, paymentMethod, q, page } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ orderNumber: rx }, { email: rx }, { "address.fullName": rx }, { "address.phone": rx }, { "shipment.awb": rx }];
  }
  const [list, total, counts] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
    Order.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({
    orders: list.map((o) => o.toAdmin()),
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}

async function getOrder(req, res) {
  res.json({ order: (await loadOrder(req.params.id)).toAdmin(), shiprocket: shiprocketConfigured() });
}

async function updateStatus(req, res) {
  const order = await loadOrder(req.params.id);
  const source = req.user.role === "admin" ? "admin" : "staff";
  // Staff handle fulfilment; cancelling (which can trigger a refund) is an admin decision.
  if (req.body.status === "cancelled" && source !== "admin") throw AppError.forbidden("Only an admin can cancel orders.");
  const before = order.status;
  const updated = await orders.advanceOrder(order, req.body.status, { source, by: req.user.id, note: req.body.note, shipment: req.body.shipment });
  audit(req, { action: "order.status", resourceId: order._id, before: { status: before }, after: { status: updated.status, ...(req.body.note ? { note: req.body.note } : {}), ...(req.body.shipment ? { shipment: req.body.shipment } : {}) }, summary: order.orderNumber });
  res.json({ order: updated.toAdmin() });
}

// Retry a Shiprocket booking that failed when the order was packed.
async function retryShipment(req, res) {
  const order = await loadOrder(req.params.id);
  if (!shiprocketConfigured()) throw new AppError(503, "SHIPPING_UNAVAILABLE", "Shiprocket isn’t configured.");
  if (order.status !== "packed") throw new AppError(409, "INVALID_TRANSITION", "Only packed orders can be booked with the courier.");
  const updated = await orders.bookShipment(order);
  audit(req, { action: "order.shipment", resourceId: order._id, after: { awb: updated.shipment?.awb, error: updated.shipment?.error }, summary: order.orderNumber });
  res.json({ order: updated.toAdmin() });
}

async function refund(req, res) {
  const order = await loadOrder(req.params.id);
  const updated = await orders.refundOrder(order, { ...req.body, by: req.user.id });
  audit(req, { action: "order.refund", resourceId: order._id, before: { status: order.status, refund: order.refund?.toObject?.() ?? order.refund }, after: { status: updated.status, refund: updated.refund?.toObject?.() ?? updated.refund }, summary: order.orderNumber });
  res.json({ order: updated.toAdmin() });
}

async function invoice(req, res) {
  await sendInvoice(res, await loadOrder(req.params.id));
}

// --- Delivery rules ----------------------------------------------------------------------------

async function getDelivery(req, res) {
  res.json({ settings: await getDeliverySettings(), shiprocket: shiprocketConfigured() });
}

async function updateDelivery(req, res) {
  const set = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (v && typeof v === "object") for (const [sub, val] of Object.entries(v)) set[`${k}.${sub}`] = val;
    else set[k] = v;
  }
  const before = await getDeliverySettings();
  await DeliverySettings.updateOne({ _id: "delivery" }, { $set: set }, { upsert: true, runValidators: true });
  const after = await getDeliverySettings();
  audit(req, { action: "delivery.update", resourceId: "delivery", before, after });
  res.json({ settings: after });
}

async function listPincodeRules(req, res) {
  const q = String(req.query.q ?? "").replace(/\D/g, "").slice(0, 6);
  const rules = await PincodeRule.find(q ? { pincode: new RegExp(`^${q}`) } : {})
    .sort({ pincode: 1 })
    .limit(500);
  res.json({ rules: rules.map((r) => r.toAdmin()) });
}

async function createPincodeRule(req, res) {
  try {
    const rule = await PincodeRule.create(req.body);
    audit(req, { action: "pincodeRule.create", resourceId: rule._id, after: rule, summary: rule.pincode });
    res.status(201).json({ rule: rule.toAdmin() });
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "CONFLICT", "There is already a rule for that PIN code", [{ path: "pincode", message: "Already exists" }]);
    throw err;
  }
}

async function updatePincodeRule(req, res) {
  const rule = await PincodeRule.findById(req.params.id);
  if (!rule) throw AppError.notFound("Rule not found");
  const before = rule.toObject();
  rule.set(req.body);
  try {
    await rule.save();
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "CONFLICT", "There is already a rule for that PIN code", [{ path: "pincode", message: "Already exists" }]);
    throw err;
  }
  audit(req, { action: "pincodeRule.update", resourceId: rule._id, before, after: rule, summary: rule.pincode });
  res.json({ rule: rule.toAdmin() });
}

async function deletePincodeRule(req, res) {
  const rule = await PincodeRule.findByIdAndDelete(req.params.id);
  if (!rule) throw AppError.notFound("Rule not found");
  audit(req, { action: "pincodeRule.delete", resourceId: rule._id, before: rule, summary: rule.pincode });
  res.status(204).end();
}

// --- PIN rules: CSV import/export and bulk actions ---------------------------------------------

const CSV_HEADER = ["pincode", "city", "state", "serviceable", "cod_available", "standard_fee_rupees", "eta_min_days", "eta_max_days", "express_available", "note", "active"];
const MAX_IMPORT_ROWS = 20000;
const yesNo = (v) => (v === undefined ? "" : v ? "yes" : "no");

async function exportPincodeRules(req, res) {
  const rules = await PincodeRule.find().sort({ pincode: 1 }).lean();
  const rows = rules.map((r) => [r.pincode, r.city, r.state, yesNo(r.serviceable), yesNo(r.codAvailable), r.standardFee === undefined || r.standardFee === null ? "" : r.standardFee / 100, r.eta?.min, r.eta?.max, yesNo(r.expressAvailable), r.note, yesNo(r.isActive)]);
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="manushyam-pincode-rules-${istDay(new Date())}.csv"`);
  res.send(toCsv(CSV_HEADER, rows));
}

function parseBool(raw, column, errors, line) {
  const v = raw.trim().toLowerCase();
  if (v === "") return undefined;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  errors.push({ path: `line ${line}`, message: `${column}: use yes or no` });
  return undefined;
}

function parseNumber(raw, column, errors, line, { paise = false } = {}) {
  const v = raw.trim();
  if (v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push({ path: `line ${line}`, message: `${column}: not a number` });
    return undefined;
  }
  return paise ? Math.round(n * 100) : n;
}

// Turns one CSV row into a pincodeRule body; empty cells are left out (existing values are kept).
function rowToRule(get, errors, line) {
  const state = get("state").trim();
  const matchedState = state ? INDIA_STATES.find((s) => s.toLowerCase() === state.toLowerCase()) : undefined;
  if (state && !matchedState) errors.push({ path: `line ${line}`, message: `state: “${state}” is not an Indian state or UT` });
  const etaMin = parseNumber(get("eta_min_days"), "eta_min_days", errors, line);
  const etaMax = parseNumber(get("eta_max_days"), "eta_max_days", errors, line);
  if ((etaMin === undefined) !== (etaMax === undefined)) errors.push({ path: `line ${line}`, message: "eta: give both min and max days, or neither" });
  const body = {
    pincode: get("pincode").trim(),
    city: get("city").trim() || undefined,
    state: matchedState,
    serviceable: parseBool(get("serviceable"), "serviceable", errors, line),
    codAvailable: parseBool(get("cod_available"), "cod_available", errors, line),
    standardFee: parseNumber(get("standard_fee_rupees"), "standard_fee_rupees", errors, line, { paise: true }),
    eta: etaMin !== undefined && etaMax !== undefined ? { min: etaMin, max: etaMax } : undefined,
    expressAvailable: parseBool(get("express_available"), "express_available", errors, line),
    note: get("note").trim() || undefined,
    isActive: parseBool(get("active"), "active", errors, line),
  };
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

// All-or-nothing: every row is checked first; if any row is invalid nothing is written.
async function importPincodeRules(req, res) {
  if (!req.file) throw AppError.badRequest("Choose a CSV file to import", [{ path: "file", message: "Required" }]);
  const rows = parseCsv(req.file.buffer.toString("utf8"));
  if (rows.length < 2) throw AppError.badRequest("The file has no rules. The first row must be the column names.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("pincode")) throw AppError.badRequest(`The first row must name the columns, including “pincode”. Expected: ${CSV_HEADER.join(", ")}`);
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw AppError.badRequest(`Import at most ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rules at a time`);

  const errors = [];
  const seen = new Set();
  const rules = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (col) => {
      const idx = header.indexOf(col);
      return idx === -1 ? "" : String(cells[idx] ?? "");
    };
    const lineErrors = [];
    const body = rowToRule(get, lineErrors, line);
    const parsed = schemas.pincodeRule.safeParse(body);
    if (!parsed.success) for (const issue of parsed.error.issues) lineErrors.push({ path: `line ${line}`, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
    if (parsed.success && seen.has(parsed.data.pincode)) lineErrors.push({ path: `line ${line}`, message: `pincode ${parsed.data.pincode} appears more than once` });
    if (lineErrors.length) errors.push(...lineErrors);
    else {
      seen.add(parsed.data.pincode);
      rules.push(parsed.data);
    }
  });
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", `${errors.length} problem${errors.length === 1 ? "" : "s"} found — nothing was imported.`, errors.slice(0, 50));

  const existing = new Set((await PincodeRule.find({ pincode: { $in: rules.map((r) => r.pincode) } }).select("pincode").lean()).map((r) => r.pincode));
  await PincodeRule.bulkWrite(
    rules.map(({ pincode, ...rest }) => ({ updateOne: { filter: { pincode }, update: { $set: rest, $setOnInsert: { pincode } }, upsert: true } })),
    { ordered: false }
  );
  const updated = rules.filter((r) => existing.has(r.pincode)).length;
  const result = { total: rules.length, created: rules.length - updated, updated };
  audit(req, { action: "pincodeRule.import", resourceId: "csv", after: { ...result, file: req.file.originalname?.slice(0, 120) }, summary: `${result.created} created, ${result.updated} updated` });
  res.json(result);
}

async function bulkPincodeRules(req, res) {
  const { ids, action } = req.body;
  const rules = await PincodeRule.find({ _id: { $in: ids } }).select("pincode");
  if (action === "delete") await PincodeRule.deleteMany({ _id: { $in: ids } });
  else await PincodeRule.updateMany({ _id: { $in: ids } }, { $set: { isActive: action === "activate" } });
  audit(req, { action: `pincodeRule.bulk${action[0].toUpperCase()}${action.slice(1)}`, resourceId: "bulk", after: { pincodes: rules.map((r) => r.pincode) }, summary: `${rules.length} rules` });
  res.json({ affected: rules.length });
}

// --- Orders export (rows for CSV/Excel built in the browser) -----------------------------------

const MAX_EXPORT = 5000;

async function exportOrders(req, res) {
  const { from, to, status, paymentMethod } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = { $in: status.split(",").filter(Boolean) };
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) filter.createdAt.$lt = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000);
  }
  const list = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT + 1)
    .select("orderNumber invoiceNumber createdAt status paymentMethod email customerName address items amounts coupon shipment.awb shipment.courier refund.status refund.amount")
    .lean();
  const rows = list.slice(0, MAX_EXPORT).map((o) => ({
    orderNumber: o.orderNumber,
    invoiceNumber: o.invoiceNumber ?? null,
    placedAt: o.createdAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
    customer: o.customerName ?? o.address?.fullName ?? null,
    email: o.email,
    phone: o.address?.phone ?? null,
    city: o.address?.city ?? null,
    state: o.address?.state ?? null,
    pincode: o.address?.pincode ?? null,
    items: o.items.map((i) => `${i.sku} × ${i.qty}`).join("; "),
    units: o.items.reduce((n, i) => n + i.qty, 0),
    subtotal: o.amounts.subtotal,
    discount: o.amounts.discount ?? 0,
    coupon: o.coupon?.code ?? null,
    shipping: o.amounts.shipping ?? 0,
    codFee: o.amounts.codFee ?? 0,
    total: o.amounts.total,
    refunded: o.refund?.status === "processed" ? o.refund.amount ?? 0 : 0,
    courier: o.shipment?.courier ?? null,
    awb: o.shipment?.awb ?? null,
  }));
  res.set("Cache-Control", "no-store");
  res.json({ rows, truncated: list.length > MAX_EXPORT, limit: MAX_EXPORT });
}

module.exports = { exportPincodeRules, importPincodeRules, bulkPincodeRules, exportOrders, listOrders, getOrder, updateStatus, retryShipment, refund, invoice, getDelivery, updateDelivery, listPincodeRules, createPincodeRule, updatePincodeRule, deletePincodeRule };
