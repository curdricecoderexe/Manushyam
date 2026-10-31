const express = require("express");
const ctrl = require("../Controller/engagementController");
const admin = require("../Controller/adminEngagementController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiter, limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/engagement");

function engagementRoutes() {
  const router = express.Router();
  const auth = requireAuth;
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  const bySlug = validate({ params: schemas.slugParam });
  // Public forms that send email: keep them slow per IP.
  const subscribeLimit = limiter({ name: "newsletter", windowMs: 15 * 60 * 1000, max: 5 });
  const tokenLimit = limiter({ name: "newsletter-token", windowMs: 15 * 60 * 1000, max: 20 });
  const contactLimit = limiter({ name: "contact", windowMs: 60 * 60 * 1000, max: 5 });
  const reviewLimit = limiter({ name: "review", windowMs: 60 * 60 * 1000, max: 20, keyByUser: true });

  // Reviews
  router.get("/products/:slug/reviews", bySlug, validate({ query: schemas.productReviewsQuery }), ctrl.productReviews);
  router.get("/reviews/highlights", validate({ query: schemas.highlightsQuery }), ctrl.reviewHighlights);
  router.get("/me/reviews", auth, ctrl.myReviews);
  router.post("/reviews", auth, reviewLimit, validate({ body: schemas.reviewCreate }), ctrl.createReview);
  router.patch("/reviews/:id", auth, reviewLimit, byId, validate({ body: schemas.reviewUpdate }), ctrl.updateReview);
  router.delete("/reviews/:id", auth, write, byId, ctrl.deleteReview);

  // Blog
  router.get("/blog/categories", ctrl.blogCategories);
  router.get("/blog/featured", ctrl.featuredPost);
  router.get("/blog/posts", validate({ query: schemas.postsQuery }), ctrl.blogPosts);
  router.get("/blog/posts/:slug", bySlug, ctrl.blogPost);

  // Newsletter & contact
  router.post("/newsletter/subscribe", subscribeLimit, validate({ body: schemas.subscribe }), ctrl.subscribe);
  router.post("/newsletter/confirm", tokenLimit, validate({ body: schemas.confirm }), ctrl.confirmSubscription);
  router.post("/newsletter/unsubscribe", tokenLimit, validate({ body: schemas.unsubscribe }), ctrl.unsubscribe);
  router.post("/contact", contactLimit, validate({ body: schemas.contact }), ctrl.submitContact);

  // Admin: moderation and CMS are admin-only; the contact inbox is shared with staff (support).
  const adminOnly = [requireAuth, requireRole("admin")];
  const staff = [requireAuth, requireRole("staff", "admin")];
  router.get("/admin/reviews", ...adminOnly, validate({ query: schemas.adminReviewsQuery }), admin.listReviews);
  router.patch("/admin/reviews/:id", ...adminOnly, write, byId, validate({ body: schemas.moderate }), admin.moderateReview);
  router.delete("/admin/reviews/:id", ...adminOnly, write, byId, admin.deleteReview);

  router.get("/admin/blog/posts", ...adminOnly, validate({ query: schemas.adminPostsQuery }), admin.listPosts);
  router.get("/admin/blog/posts/:id", ...adminOnly, byId, admin.getPost);
  router.post("/admin/blog/posts", ...adminOnly, write, validate({ body: schemas.postCreate }), admin.createPost);
  router.patch("/admin/blog/posts/:id", ...adminOnly, write, byId, validate({ body: schemas.postUpdate }), admin.updatePost);
  router.delete("/admin/blog/posts/:id", ...adminOnly, write, byId, admin.deletePost);
  router.get("/admin/blog/categories", ...adminOnly, admin.listCategories);
  router.post("/admin/blog/categories", ...adminOnly, write, validate({ body: schemas.categoryCreate }), admin.createCategory);
  router.patch("/admin/blog/categories/:id", ...adminOnly, write, byId, validate({ body: schemas.categoryUpdate }), admin.updateCategory);
  router.delete("/admin/blog/categories/:id", ...adminOnly, write, byId, admin.deleteCategory);

  router.get("/admin/newsletter", ...adminOnly, validate({ query: schemas.subscribersQuery }), admin.listSubscribers);
  router.get("/admin/contact-messages", ...staff, validate({ query: schemas.contactQuery }), admin.listContactMessages);
  router.patch("/admin/contact-messages/:id", ...staff, write, byId, validate({ body: schemas.contactUpdate }), admin.updateContactMessage);

  return router;
}

module.exports = { engagementRoutes };
