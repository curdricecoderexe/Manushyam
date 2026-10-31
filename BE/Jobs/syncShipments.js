const { Order } = require("../Models/Order");
const { shiprocketConfigured, trackAwb } = require("../Services/shiprocket");
const { applyTracking } = require("../Services/orders");
const { logger } = require("../Utils/logger");

const STALE_MS = 50 * 60 * 1000;

// Hourly fallback for missed tracking webhooks: re-reads the courier status of open shipments.
async function syncShipments(now = new Date()) {
  if (!shiprocketConfigured()) return { checked: 0, updated: 0 };
  const open = await Order.find({
    status: { $in: ["packed", "shipped", "out_for_delivery"] },
    "shipment.awb": { $exists: true, $ne: null },
    $or: [{ "shipment.lastSyncedAt": { $exists: false } }, { "shipment.lastSyncedAt": { $lte: new Date(now.getTime() - STALE_MS) } }],
  }).limit(100);
  let updated = 0;
  for (const order of open) {
    try {
      const track = await trackAwb(order.shipment.awb);
      const after = await applyTracking(order, { status: track.currentStatus, events: track.events, trackingUrl: track.trackingUrl });
      if (after.status !== order.status) updated += 1;
    } catch (err) {
      logger.warn({ err: err.message, orderNumber: order.orderNumber }, "Shipment sync failed");
    }
  }
  return { checked: open.length, updated };
}

module.exports = { syncShipments };
