const express = require("express");
const multer = require("multer");
const users = require("../Controller/adminUserController");
const system = require("../Controller/adminSystemController");
const orders = require("../Controller/adminOrderController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/admin");
const { webReport, liveVisitors } = require("../Services/webAnalytics");
const { AppError } = require("../Utils/AppError");

// CSV uploads are read in memory (1 MB is ~20,000 PIN rules).
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1, fields: 2 } }).single("file");
function parseCsvUpload(req, res, next) {
  csvUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(413, "PAYLOAD_TOO_LARGE", "CSV files must be 1 MB or smaller"));
    return next(AppError.badRequest("Upload one CSV file in the “file” field"));
  });
}

// Admin-only system screens: users, appearance, analytics, audit log, PIN-rule bulk tools.
// Order export is shared with staff (they already see every order).
function adminSystemRoutes() {
  const router = express.Router();
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  const admin = [requireAuth, requireRole("admin")];
  const staff = [requireAuth, requireRole("staff", "admin")];

  router.get("/admin/users", ...admin, validate({ query: schemas.usersQuery }), users.listUsers);
  router.get("/admin/users/:id", ...admin, byId, users.getUser);
  router.post("/admin/users", ...admin, write, validate({ body: schemas.userCreate }), users.createUser);
  router.patch("/admin/users/:id", ...admin, write, byId, validate({ body: schemas.userUpdate }), users.updateUser);
  router.delete("/admin/users/:id", ...admin, write, byId, validate({ query: schemas.userDeleteQuery }), users.deleteUser);
  router.post("/admin/users/:id/restore", ...admin, write, byId, users.restoreUser);

  router.get("/appearance", system.publicAppearance);
  router.get("/admin/appearance", ...admin, system.getAppearanceAdmin);
  router.put("/admin/appearance/:key", ...admin, write, validate({ params: schemas.slotParam, body: schemas.slotUpdate }), system.setSlot);
  router.delete("/admin/appearance/:key", ...admin, write, validate({ params: schemas.slotParam }), system.resetSlot);

  router.get("/admin/analytics/sales", ...admin, validate({ query: schemas.rangeQuery }), system.sales);
  router.get("/admin/analytics/sales.pdf", ...admin, validate({ query: schemas.rangeQuery }), system.salesPdf);
  router.get("/admin/analytics/web", ...admin, validate({ query: schemas.rangeQuery }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await webReport(req.validatedQuery));
  });
  router.get("/admin/analytics/live", ...admin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await liveVisitors());
  });
  router.get("/admin/audit-logs", ...admin, validate({ query: schemas.auditQuery }), system.auditLogs);

  router.get("/admin/pincode-rules/export", ...admin, orders.exportPincodeRules);
  router.post("/admin/pincode-rules/import", ...admin, write, parseCsvUpload, orders.importPincodeRules);
  router.post("/admin/pincode-rules/bulk", ...admin, write, validate({ body: schemas.pincodeBulk }), orders.bulkPincodeRules);
  router.get("/admin/orders-export", ...staff, validate({ query: schemas.ordersExportQuery }), orders.exportOrders);

  return router;
}

module.exports = { adminSystemRoutes };
