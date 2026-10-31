const { Review } = require("../Models/Review");
const { Product } = require("../Models/Product");
const { Order } = require("../Models/Order");
const { User } = require("../Models/User");
const { BlogCategory, BlogPost, liveFilter } = require("../Models/Blog");
const reviews = require("../Services/reviews");
const newsletter = require("../Services/newsletter");
const contact = require("../Services/contact");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const REVIEW_PAGE = 5;
const SORTS = { newest: { createdAt: -1 }, highest: { rating: -1, createdAt: -1 }, lowest: { rating: 1, createdAt: -1 } };
const publicCache = (res) => res.set("Cache-Control", "public, max-age=60");

// --- Reviews ------------------------------------------------------------------------------------

async function productReviews(req, res) {
  const product = await Product.findOne({ slug: req.params.slug, status: "published" }).select("_id");
  if (!product) throw AppError.notFound("Product not found");
  const { page, sort } = req.validatedQuery;
  const filter = { product: product._id, status: "published" };
  const [summary, list] = await Promise.all([
    reviews.ratingSummary(product._id),
    Review.find(filter)
      .sort(SORTS[sort])
      .skip((page - 1) * REVIEW_PAGE)
      .limit(REVIEW_PAGE),
  ]);
  publicCache(res);
  res.json({ summary, reviews: list.map((r) => r.toPublic()), page, pages: Math.max(1, Math.ceil(summary.count / REVIEW_PAGE)) });
}

// Recent glowing reviews across the store (blog sidebar, home).
async function reviewHighlights(req, res) {
  const list = await Review.find({ status: "published", rating: { $gte: 4 } })
    .sort({ createdAt: -1 })
    .limit(req.validatedQuery.limit)
    .populate("product", "slug name images");
  publicCache(res);
  res.json({ reviews: list.map((r) => ({ ...r.toPublic(), product: reviews.productCard(r.product) })) });
}

async function myReviews(req, res) {
  res.set("Cache-Control", "no-store");
  res.json(await reviews.reviewsForUser(req.user.id));
}

async function createReview(req, res) {
  const { orderNumber, productSlug, rating, title, body } = req.body;
  const order = await Order.findOne({ orderNumber, user: req.user.id }).select("status items");
  if (!order) throw AppError.notFound("Order not found");
  if (order.status !== "delivered") throw new AppError(409, "NOT_DELIVERED", "You can review a product once your order has been delivered.");
  const product = await Product.findOne({ slug: productSlug }).select("_id slug name images");
  if (!product || !order.items.some((i) => String(i.product) === String(product._id))) throw AppError.notFound("That product isn’t part of this order.");

  const user = await User.findById(req.user.id).select("name");
  let review;
  try {
    review = await Review.create({ product: product._id, order: order._id, user: req.user.id, authorName: reviews.displayName(user?.name), rating, title, body });
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "ALREADY_REVIEWED", "You’ve already reviewed this product for this order — you can edit your review instead.");
    throw err;
  }
  await reviews.recomputeRating(product._id);
  res.status(201).json({ review: { ...review.toPublic(), status: review.status, orderNumber, product: reviews.productCard(product) } });
}

async function loadOwnReview(req) {
  const review = await Review.findOne({ _id: req.params.id, user: req.user.id });
  if (!review) throw AppError.notFound("Review not found");
  return review;
}

async function updateReview(req, res) {
  const review = await loadOwnReview(req);
  review.set(req.body);
  await review.save();
  await reviews.recomputeRating(review.product);
  res.json({ review: { ...review.toPublic(), status: review.status } });
}

async function deleteReview(req, res) {
  const review = await loadOwnReview(req);
  await review.deleteOne();
  await reviews.recomputeRating(review.product);
  res.status(204).end();
}

// --- Blog ---------------------------------------------------------------------------------------

async function blogCategories(req, res) {
  const [cats, counts] = await Promise.all([BlogCategory.find().sort({ sortOrder: 1, name: 1 }), BlogPost.aggregate([{ $match: liveFilter() }, { $group: { _id: "$category", n: { $sum: 1 } } }])]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  publicCache(res);
  res.json({
    categories: cats.map((c) => ({ slug: c.slug, name: c.name, description: c.description ?? "", count: byId.get(String(c._id)) ?? 0 })),
    total: counts.reduce((n, c) => n + c.n, 0),
  });
}

async function blogPosts(req, res) {
  const { category, page, limit } = req.validatedQuery;
  const filter = liveFilter();
  if (category) {
    const cat = await BlogCategory.findOne({ slug: category }).select("_id");
    if (!cat) throw AppError.notFound("Category not found");
    filter.category = cat._id;
  }
  const [list, total] = await Promise.all([
    BlogPost.find(filter)
      .sort({ publishAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category", "slug name"),
    BlogPost.countDocuments(filter),
  ]);
  publicCache(res);
  res.json({ posts: list.map((p) => p.toCard()), page, pages: Math.max(1, Math.ceil(total / limit)), total });
}

// The featured article, or the newest one if none is marked.
async function featuredPost(req, res) {
  const live = liveFilter();
  const post = (await BlogPost.findOne({ ...live, isFeatured: true }).sort({ publishAt: -1 }).populate("category", "slug name")) ?? (await BlogPost.findOne(live).sort({ publishAt: -1 }).populate("category", "slug name"));
  publicCache(res);
  res.json({ post: post ? post.toCard() : null });
}

async function blogPost(req, res) {
  const live = liveFilter();
  const post = await BlogPost.findOne({ ...live, slug: req.params.slug }).populate("category", "slug name");
  if (!post) throw AppError.notFound("Article not found");
  let related = await BlogPost.find({ ...live, _id: { $ne: post._id }, ...(post.category ? { category: post.category._id } : {}) })
    .sort({ publishAt: -1 })
    .limit(3)
    .populate("category", "slug name");
  if (related.length < 3) {
    const more = await BlogPost.find({ ...live, _id: { $nin: [post._id, ...related.map((r) => r._id)] } })
      .sort({ publishAt: -1 })
      .limit(3 - related.length)
      .populate("category", "slug name");
    related = [...related, ...more];
  }
  publicCache(res);
  res.json({ post: post.toPublic(), related: related.map((r) => r.toCard()) });
}

// --- Newsletter & contact -----------------------------------------------------------------------

const SUBSCRIBE_REPLY = { message: "Check your inbox to confirm your subscription." };

async function subscribe(req, res) {
  if (req.body.website) {
    logger.info({ ip: req.ip }, "Newsletter honeypot triggered");
    return res.status(202).json(SUBSCRIBE_REPLY);
  }
  await newsletter.subscribe({ email: req.body.email, source: req.body.source });
  return res.status(202).json(SUBSCRIBE_REPLY);
}

async function confirmSubscription(req, res) {
  const sub = await newsletter.confirm(req.body.token);
  res.json({ status: sub.status });
}

async function unsubscribe(req, res) {
  await newsletter.unsubscribe(req.body);
  res.json({ status: "unsubscribed" });
}

const CONTACT_REPLY = { message: "Thank you — we’ve received your message and will reply within one working day." };

async function submitContact(req, res) {
  if (req.body.website) {
    logger.info({ ip: req.ip }, "Contact honeypot triggered");
    return res.status(201).json(CONTACT_REPLY);
  }
  contact.assertHuman(await contact.verifyTurnstile(req.body.turnstileToken, req.ip));
  await contact.submitContact(req.body, { ip: req.ip, userAgent: req.get("user-agent") });
  return res.status(201).json(CONTACT_REPLY);
}

module.exports = {
  productReviews,
  reviewHighlights,
  myReviews,
  createReview,
  updateReview,
  deleteReview,
  blogCategories,
  blogPosts,
  featuredPost,
  blogPost,
  subscribe,
  confirmSubscription,
  unsubscribe,
  submitContact,
};
