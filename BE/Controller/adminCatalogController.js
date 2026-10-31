const { Product } = require("../Models/Product");
const { HeroSlide, Faq, Page, Settings, getSettings, toPublic } = require("../Models/Content");
const { uploadImage } = require("../Services/uploads");
const { escapeRegex } = require("../Services/search");
const { audit } = require("../Services/audit");
const { AppError } = require("../Utils/AppError");

// Cost price and supplier are admin-only; staff manage stock and copy but never see margins.
const canSeeInternal = (req) => req.user.role === "admin";

function adminView(req, product) {
  return product.toAdmin({ includeInternal: canSeeInternal(req) });
}

// Mongo duplicate-key errors become a clear 409 instead of a 500.
function duplicateToConflict(err) {
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "value";
    const label = field.startsWith("variants") ? "SKU" : field;
    return new AppError(409, "CONFLICT", `That ${label} is already in use`, [{ path: field === "variants.sku" ? "variants" : field, message: "Already in use" }]);
  }
  return err;
}

async function assertRelatedExist(ids, selfId) {
  if (!ids?.length) return;
  if (selfId && ids.includes(String(selfId))) throw AppError.badRequest("A product can’t be related to itself", [{ path: "related", message: "Remove this product" }]);
  const count = await Product.countDocuments({ _id: { $in: ids } });
  if (count !== new Set(ids).size) throw AppError.badRequest("Some related products don’t exist", [{ path: "related", message: "Unknown product" }]);
}

// --- Products ----------------------------------------------------------------------------------

async function listProducts(req, res) {
  const { status, q, page, limit } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { slug: rx }, { "variants.sku": rx }];
  }
  const query = Product.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit);
  if (canSeeInternal(req)) query.select("+internal");
  const [items, total] = await Promise.all([query, Product.countDocuments(filter)]);
  res.json({ products: items.map((p) => adminView(req, p)), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function getProduct(req, res) {
  const query = Product.findById(req.params.id);
  if (canSeeInternal(req)) query.select("+internal");
  const product = await query;
  if (!product) throw AppError.notFound("Product not found");
  res.json({ product: adminView(req, product) });
}

async function createProduct(req, res) {
  const body = { ...req.body };
  if (!canSeeInternal(req)) delete body.internal;
  await assertRelatedExist(body.related);
  try {
    const product = await Product.create(body);
    audit(req, { action: "product.create", resourceId: product._id, after: product, summary: product.name });
    res.status(201).json({ product: adminView(req, product) });
  } catch (err) {
    throw duplicateToConflict(err);
  }
}

async function updateProduct(req, res) {
  const body = { ...req.body };
  if (!canSeeInternal(req)) delete body.internal;
  const product = await Product.findById(req.params.id).select("+internal");
  if (!product) throw AppError.notFound("Product not found");
  await assertRelatedExist(body.related, product._id);
  if (body.internal) body.internal = { ...(product.internal?.toObject?.() ?? {}), ...body.internal };
  const before = product.toObject();
  product.set(body);
  try {
    await product.save();
  } catch (err) {
    throw duplicateToConflict(err);
  }
  audit(req, { action: "product.update", resourceId: product._id, before, after: product, summary: product.name });
  res.json({ product: adminView(req, product) });
}

// Stock-only update used by the inventory screen (and by staff).
async function updateStock(req, res) {
  const { sku, stock } = req.body;
  const product = await Product.findOne({ _id: req.params.id, "variants.sku": sku });
  if (!product) throw AppError.notFound("Variant not found");
  const variant = product.variants.find((v) => v.sku === sku);
  const previous = variant.stock;
  variant.stock = stock;
  await product.save();
  audit(req, { action: "product.stock", resourceId: product._id, before: { [sku]: previous }, after: { [sku]: stock }, summary: `${sku}: ${previous} → ${stock}` });
  res.json({ product: adminView(req, product) });
}

// Products are archived, not deleted, so past orders keep pointing at a real document.
async function archiveProduct(req, res) {
  const product = await Product.findByIdAndUpdate(req.params.id, { $set: { status: "archived" } });
  if (!product) throw AppError.notFound("Product not found");
  audit(req, { action: "product.archive", resourceId: product._id, before: { status: product.status }, after: { status: "archived" }, summary: product.name });
  res.status(204).end();
}

// --- CMS collections (admin only) --------------------------------------------------------------

function crud(Model, { sort, label, resource }) {
  return {
    async list(req, res) {
      const items = await Model.find().sort(sort);
      res.json({ items: items.map(toPublic) });
    },
    async create(req, res) {
      try {
        const doc = await Model.create(req.body);
        audit(req, { action: `${resource}.create`, resourceId: doc._id, after: doc });
        res.status(201).json({ item: toPublic(doc) });
      } catch (err) {
        throw duplicateToConflict(err);
      }
    },
    async update(req, res) {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw AppError.notFound(`${label} not found`);
      const before = doc.toObject();
      doc.set(req.body);
      try {
        await doc.save();
      } catch (err) {
        throw duplicateToConflict(err);
      }
      audit(req, { action: `${resource}.update`, resourceId: doc._id, before, after: doc });
      res.json({ item: toPublic(doc) });
    },
    async remove(req, res) {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw AppError.notFound(`${label} not found`);
      audit(req, { action: `${resource}.delete`, resourceId: doc._id, before: doc });
      res.status(204).end();
    },
  };
}

const heroSlides = crud(HeroSlide, { sort: { sortOrder: 1, _id: 1 }, label: "Slide", resource: "heroSlide" });
const faqs = crud(Faq, { sort: { topic: 1, sortOrder: 1, _id: 1 }, label: "FAQ", resource: "faq" });
const pages = crud(Page, { sort: { sortOrder: 1, title: 1 }, label: "Page", resource: "page" });

async function getSiteSettings(req, res) {
  res.json({ settings: await getSettings() });
}

async function updateSiteSettings(req, res) {
  const before = await getSettings();
  await Settings.findByIdAndUpdate("site", { $set: req.body }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  const after = await getSettings();
  audit(req, { action: "settings.update", resourceId: "site", before, after });
  res.json({ settings: after });
}

// --- Uploads -----------------------------------------------------------------------------------

async function upload(req, res) {
  if (!req.file) throw AppError.badRequest("Choose an image to upload", [{ path: "file", message: "Required" }]);
  const folder = req.body?.folder === "content" ? "content" : "products";
  const result = await uploadImage({ buffer: req.file.buffer, declaredType: req.file.mimetype, folder });
  res.status(201).json({ image: result });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateStock,
  archiveProduct,
  heroSlides,
  faqs,
  pages,
  getSiteSettings,
  updateSiteSettings,
  upload,
};
