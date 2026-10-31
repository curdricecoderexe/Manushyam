const express = require("express");
const multer = require("multer");
const ctrl = require("../Controller/adminCatalogController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/catalog");
const { MAX_IMAGE_BYTES } = require("../Services/uploads");
const { AppError } = require("../Utils/AppError");

// Files are held in memory (max 5 MB, one file) so their bytes can be checked before they go anywhere.
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 4 } }).single("file");

function parseUpload(req, res, next) {
  imageUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(413, "PAYLOAD_TOO_LARGE", "Images must be 5 MB or smaller"));
    return next(AppError.badRequest("Upload one image in the “file” field"));
  });
}

function adminCatalogRoutes() {
  const router = express.Router();
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  const staff = [requireAuth, requireRole("staff", "admin")];
  const admin = [requireAuth, requireRole("admin")];

  // Products & stock: staff and admins (staff never see cost/supplier fields).
  router.get("/products", ...staff, validate({ query: schemas.adminListQuery }), ctrl.listProducts);
  router.get("/products/:id", ...staff, byId, ctrl.getProduct);
  router.post("/products", ...staff, write, validate({ body: schemas.productCreate }), ctrl.createProduct);
  router.patch("/products/:id", ...staff, write, byId, validate({ body: schemas.productUpdate }), ctrl.updateProduct);
  router.patch("/products/:id/stock", ...staff, write, byId, validate({ body: schemas.stockUpdate }), ctrl.updateStock);
  router.delete("/products/:id", ...admin, write, byId, ctrl.archiveProduct);
  router.post("/uploads", ...staff, write, parseUpload, ctrl.upload);

  // Storefront CMS: admins only.
  const cms = [
    ["hero-slides", ctrl.heroSlides, schemas.heroSlide, schemas.heroSlideUpdate],
    ["faqs", ctrl.faqs, schemas.faq, schemas.faqUpdate],
    ["pages", ctrl.pages, schemas.page, schemas.pageUpdate],
  ];
  for (const [path, handlers, createSchema, updateSchema] of cms) {
    router.get(`/${path}`, ...admin, handlers.list);
    router.post(`/${path}`, ...admin, write, validate({ body: createSchema }), handlers.create);
    router.patch(`/${path}/:id`, ...admin, write, byId, validate({ body: updateSchema }), handlers.update);
    router.delete(`/${path}/:id`, ...admin, write, byId, handlers.remove);
  }
  router.get("/settings", ...admin, ctrl.getSiteSettings);
  router.put("/settings", ...admin, write, validate({ body: schemas.settings }), ctrl.updateSiteSettings);

  return router;
}

module.exports = { adminCatalogRoutes };
