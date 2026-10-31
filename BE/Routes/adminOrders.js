const express = require("express");
const ctrl = require("../Controller/adminOrderController");
const { dashboard } = require("../Controller/dashboardController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/orders");

function adminOrderRoutes() {
  const router = express.Router();
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  const staff = [requireAuth, requireRole("staff", "admin")];
  const admin = [requireAuth, requireRole("admin")];

  router.get("/dashboard", ...staff, dashboard);

  // Fulfilment: staff and admins. Refunds and delivery rules: admins only.
  router.get("/orders", ...staff, validate({ query: schemas.adminListQuery }), ctrl.listOrders);
  router.get("/orders/:id", ...staff, byId, ctrl.getOrder);
  router.get("/orders/:id/invoice", ...staff, byId, ctrl.invoice);
  router.post("/orders/:id/status", ...staff, write, byId, validate({ body: schemas.statusUpdate }), ctrl.updateStatus);
  router.post("/orders/:id/shipment", ...staff, write, byId, ctrl.retryShipment);
  router.post("/orders/:id/refund", ...admin, write, byId, validate({ body: schemas.refund }), ctrl.refund);

  router.get("/delivery", ...admin, ctrl.getDelivery);
  router.put("/delivery", ...admin, write, validate({ body: schemas.deliverySettings }), ctrl.updateDelivery);
  router.get("/pincode-rules", ...admin, ctrl.listPincodeRules);
  router.post("/pincode-rules", ...admin, write, validate({ body: schemas.pincodeRule }), ctrl.createPincodeRule);
  router.patch("/pincode-rules/:id", ...admin, write, byId, validate({ body: schemas.pincodeRuleUpdate }), ctrl.updatePincodeRule);
  router.delete("/pincode-rules/:id", ...admin, write, byId, ctrl.deletePincodeRule);

  return router;
}

module.exports = { adminOrderRoutes };
