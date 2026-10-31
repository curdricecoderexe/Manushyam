const { Product } = require("../Models/Product");
const { AppError } = require("../Utils/AppError");

// Recompute the listing flag after stock moves (it is otherwise derived on save).
const syncInStock = [{ $set: { inStock: { $anyElementTrue: [{ $map: { input: "$variants", in: { $gt: ["$$this.stock", 0] } } }] } } }];

// Takes each line out of stock only if enough is left, so two buyers can never both get the last unit.
// Must run inside the order transaction: a failure part-way rolls back the earlier decrements.
async function takeStock(lines, session) {
  for (const { sku, qty, name } of lines) {
    const res = await Product.updateOne(
      { status: "published", variants: { $elemMatch: { sku, stock: { $gte: qty } } } },
      { $inc: { "variants.$.stock": -qty } },
      { session }
    );
    if (res.modifiedCount !== 1) {
      throw new AppError(409, "OUT_OF_STOCK", `${name ?? sku} just sold out or has fewer units left. Please review your cart.`, [{ path: sku, message: "Not enough stock" }]);
    }
  }
  await Product.updateMany({ "variants.sku": { $in: lines.map((l) => l.sku) } }, syncInStock, { session });
}

// Puts quantities back (cancelled / expired orders). Archived products still get their stock back.
async function returnStock(lines, session) {
  for (const { sku, qty } of lines) {
    await Product.updateOne({ "variants.sku": sku }, { $inc: { "variants.$.stock": qty } }, { session });
  }
  await Product.updateMany({ "variants.sku": { $in: lines.map((l) => l.sku) } }, syncInStock, { session });
}

module.exports = { takeStock, returnStock };
