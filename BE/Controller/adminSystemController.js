const { Appearance, getAppearance } = require("../Models/Content");
const { AuditLog } = require("../Models/AuditLog");
const { salesReport } = require("../Services/salesAnalytics");
const { buildSalesPdf } = require("../Services/salesReportPdf");
const { audit } = require("../Services/audit");

// --- Appearance (storefront image slots) --------------------------------------------------------

async function publicAppearance(req, res) {
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ slots: await getAppearance() });
}

async function getAppearanceAdmin(req, res) {
  res.json({ slots: await getAppearance() });
}

async function setSlot(req, res) {
  const { key } = req.params;
  const before = (await getAppearance())[key] ?? null;
  await Appearance.updateOne({ _id: "appearance" }, { $set: { [`slots.${key}`]: req.body } }, { upsert: true, runValidators: true });
  audit(req, { action: "appearance.update", resourceId: key, before: { [key]: before }, after: { [key]: req.body } });
  res.json({ slots: await getAppearance() });
}

async function resetSlot(req, res) {
  const { key } = req.params;
  const before = (await getAppearance())[key] ?? null;
  await Appearance.updateOne({ _id: "appearance" }, { $unset: { [`slots.${key}`]: "" } });
  if (before) audit(req, { action: "appearance.reset", resourceId: key, before: { [key]: before }, after: { [key]: null } });
  res.json({ slots: await getAppearance() });
}

// --- Sales analytics ----------------------------------------------------------------------------

async function sales(req, res) {
  res.set("Cache-Control", "no-store");
  res.json(await salesReport(req.validatedQuery));
}

async function salesPdf(req, res) {
  const report = await salesReport(req.validatedQuery);
  const pdf = await buildSalesPdf(report);
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `attachment; filename="manushyam-sales-${report.range.from}-to-${report.range.to}.pdf"`);
  res.set("Cache-Control", "no-store");
  res.send(pdf);
}

// --- Audit log ----------------------------------------------------------------------------------

const AUDIT_PAGE = 50;

async function auditLogs(req, res) {
  const { actor, resource, resourceId, action, from, to, page } = req.validatedQuery;
  const filter = {};
  if (actor) filter.actor = actor;
  if (resource) filter.resource = resource;
  if (resourceId) filter.resourceId = resourceId;
  if (action) filter.action = action;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) filter.createdAt.$lt = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000);
  }
  const [entries, total, resources, actors] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * AUDIT_PAGE)
      .limit(AUDIT_PAGE),
    AuditLog.countDocuments(filter),
    AuditLog.distinct("resource"),
    AuditLog.aggregate([{ $group: { _id: "$actor", email: { $last: "$actorEmail" }, role: { $last: "$actorRole" } } }, { $sort: { email: 1 } }, { $limit: 200 }]),
  ]);
  res.set("Cache-Control", "no-store");
  res.json({
    entries: entries.map((e) => e.toAdmin()),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE)),
    facets: { resources: resources.sort(), actors: actors.map((a) => ({ id: String(a._id), email: a.email, role: a.role })) },
  });
}

module.exports = { publicAppearance, getAppearanceAdmin, setSlot, resetSlot, sales, salesPdf, auditLogs };
