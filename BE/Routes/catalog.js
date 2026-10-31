const express = require("express");
const ctrl = require("../Controller/catalogController");
const { validate } = require("../Middleware/validate");
const { limiter } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/catalog");

// Public storefront reads. No auth; the global /api limiter applies, plus a tighter one on search.
function catalogRoutes() {
  const router = express.Router();
  const searchLimit = limiter({ name: "search", windowMs: 60 * 1000, max: 60 });

  router.get("/products", searchLimit, validate({ query: schemas.listQuery }), ctrl.listProducts);
  router.get("/products/suggest", searchLimit, validate({ query: schemas.suggestQuery }), ctrl.suggest);
  router.get("/products/:slug", validate({ params: schemas.slugParam }), ctrl.getProduct);

  router.get("/content/home", ctrl.home);
  router.get("/settings", ctrl.settings);
  router.get("/faqs", ctrl.listFaqs);
  router.get("/pages", ctrl.listPages);
  router.get("/pages/:slug", validate({ params: schemas.slugParam }), ctrl.getPage);

  return router;
}

module.exports = { catalogRoutes };
