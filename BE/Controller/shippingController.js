const mongoose = require("mongoose");
const { BoxSize } = require("../Models/Shipping");
const { Order } = require("../Models/Order");
const { shiprocketConfigured, generateManifest } = require("../Services/shiprocket");
const { packagingOptions } = require("../Services/packaging");
const { audit } = require("../Services/audit");
const { AppError } = require("../Utils/AppError");

const MAX_BOXES = 50;

async function loadBox(id) {
  const box = await BoxSize.findById(id);
  if (!box) throw AppError.notFound("Box size not found");
  return box;
}

const duplicateCode = (err) => err?.code === 11000 && err.keyPattern?.code;

// One default at a time: setting a new default clears the old one in the same transaction.
async function saveWithDefault(box, makeDefault) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (makeDefault) await BoxSize.updateMany({ isDefault: true, _id: { $ne: box._id } }, { $set: { isDefault: false } }, { session });
      await box.save({ session });
    });
  } catch (err) {
    if (duplicateCode(err)) throw new AppError(409, "BOX_CODE_TAKEN", "Another box already uses that code.", [{ path: "code", message: "Already used" }]);
    throw err;
  } finally {
    await session.endSession();
  }
  return box;
}

async function listBoxes(req, res) {
  const boxes = await BoxSize.find().sort({ isActive: -1, name: 1 });
  res.json({ boxes: boxes.map((b) => b.toPublic()), shiprocket: shiprocketConfigured() });
}

async function createBox(req, res) {
  if ((await BoxSize.countDocuments()) >= MAX_BOXES) throw new AppError(409, "TOO_MANY_BOXES", `Up to ${MAX_BOXES} box sizes are supported — deactivate or delete one first.`);
  const first = (await BoxSize.countDocuments({ isActive: true })) === 0;
  const box = new BoxSize({ ...req.body, isDefault: req.body.isDefault ?? first });
  if (box.isDefault && box.isActive === false) throw AppError.badRequest("The default box must be active.", [{ path: "isDefault", message: "Activate the box first" }]);
  await saveWithDefault(box, box.isDefault);
  audit(req, { action: "box.create", resourceId: box._id, after: box.toPublic(), summary: box.name });
  res.status(201).json({ box: box.toPublic() });
}

async function updateBox(req, res) {
  const box = await loadBox(req.params.id);
  const before = box.toPublic();
  box.set(req.body);
  if (req.body.maxWeightGrams === null) box.maxWeightGrams = undefined;
  if (req.body.maxUnits === null) box.maxUnits = undefined;
  if (req.body.code === null) box.code = undefined;
  if (box.isDefault && box.isActive === false) throw AppError.badRequest("The default box must be active.", [{ path: "isActive", message: "Pick another default first" }]);
  await saveWithDefault(box, req.body.isDefault === true);
  audit(req, { action: "box.update", resourceId: box._id, before, after: box.toPublic(), summary: box.name });
  res.json({ box: box.toPublic() });
}

// Orders keep a copy of the box they shipped in, so deleting a size never changes past shipments.
async function deleteBox(req, res) {
  const box = await loadBox(req.params.id);
  await box.deleteOne();
  audit(req, { action: "box.delete", resourceId: box._id, before: box.toPublic(), summary: box.name });
  res.status(204).end();
}

// Which box an order would ship in, and the alternatives (shown before "Pack & book courier").
async function orderPackaging(req, res) {
  const order = await Order.findById(req.params.id).select("items shipment status");
  if (!order) throw AppError.notFound("Order not found");
  res.json({ packaging: await packagingOptions(order.items), booked: Boolean(order.shipment?.shipmentId) });
}

async function manifest(req, res) {
  if (!shiprocketConfigured()) throw new AppError(503, "SHIPPING_UNAVAILABLE", "Shiprocket isn’t configured.");
  const order = await Order.findById(req.params.id);
  if (!order) throw AppError.notFound("Order not found");
  if (!order.shipment?.awb) throw new AppError(409, "NOT_BOOKED", "Book the courier before printing the manifest.");
  const url = await generateManifest({ shipmentId: order.shipment.shipmentId, shiprocketOrderId: order.shipment.shiprocketOrderId });
  if (!url) throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "Shiprocket didn’t return a manifest yet. Try again in a minute.");
  const updated = await Order.findByIdAndUpdate(order._id, { $set: { "shipment.manifestUrl": url } }, { new: true });
  res.json({ order: updated.toAdmin() });
}

module.exports = { listBoxes, createBox, updateBox, deleteBox, orderPackaging, manifest };
