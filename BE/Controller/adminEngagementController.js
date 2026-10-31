const { Review } = require("../Models/Review");
const { Product } = require("../Models/Product");
const { BlogCategory, BlogPost } = require("../Models/Blog");
const { NewsletterSubscriber, ContactMessage } = require("../Models/Engagement");
const { recomputeRating } = require("../Services/reviews");
const { preparePost } = require("../Services/blog");
const { audit } = require("../Services/audit");
const { AppError } = require("../Utils/AppError");

const PAGE_SIZE = 25;
const paged = (q, page) => q.skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE);
const pages = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));

function conflict(err, field, message) {
  if (err?.code === 11000) throw new AppError(409, "CONFLICT", message, [{ path: field, message: "Already in use" }]);
  throw err;
}

// --- Reviews ------------------------------------------------------------------------------------

async function listReviews(req, res) {
  const { status, rating, product, page } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (rating) filter.rating = rating;
  if (product) {
    const p = await Product.findOne({ slug: product }).select("_id");
    filter.product = p?._id ?? null;
  }
  const [list, total] = await Promise.all([
    paged(Review.find(filter).sort({ createdAt: -1 }), page).populate("product", "slug name").populate("order", "orderNumber").populate("user", "email name"),
    Review.countDocuments(filter),
  ]);
  res.json({
    reviews: list.map((r) => ({
      ...r.toPublic(),
      status: r.status,
      moderationNote: r.moderationNote ?? null,
      product: r.product ? { slug: r.product.slug, name: r.product.name } : null,
      orderNumber: r.order?.orderNumber ?? null,
      customer: r.user ? { name: r.user.name, email: r.user.email } : null,
    })),
    page,
    pages: pages(total),
    total,
  });
}

async function moderateReview(req, res) {
  const review = await Review.findById(req.params.id);
  if (!review) throw AppError.notFound("Review not found");
  const before = { status: review.status, moderationNote: review.moderationNote };
  review.status = req.body.status;
  review.moderationNote = req.body.note;
  review.moderatedBy = req.user.id;
  await review.save();
  await recomputeRating(review.product);
  audit(req, { action: "review.moderate", resourceId: review._id, before, after: { status: review.status, moderationNote: review.moderationNote } });
  res.json({ review: { ...review.toPublic(), status: review.status, moderationNote: review.moderationNote ?? null } });
}

async function deleteReview(req, res) {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw AppError.notFound("Review not found");
  audit(req, { action: "review.delete", resourceId: review._id, before: { rating: review.rating, title: review.title, body: review.body, product: review.product, order: review.order } });
  await recomputeRating(review.product);
  res.status(204).end();
}

// --- Blog ---------------------------------------------------------------------------------------

async function listPosts(req, res) {
  const { status, page } = req.validatedQuery;
  const now = new Date();
  const filter = {};
  if (status === "draft") filter.status = "draft";
  if (status === "published") Object.assign(filter, { status: "published", publishAt: { $lte: now } });
  if (status === "scheduled") Object.assign(filter, { status: "published", publishAt: { $gt: now } });
  const [list, total] = await Promise.all([paged(BlogPost.find(filter).sort({ updatedAt: -1 }), page), BlogPost.countDocuments(filter)]);
  res.json({ posts: list.map((p) => p.toAdmin()), page, pages: pages(total), total });
}

async function getPost(req, res) {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw AppError.notFound("Article not found");
  res.json({ post: post.toAdmin() });
}

async function assertCategory(id) {
  if (id && !(await BlogCategory.exists({ _id: id }))) throw AppError.badRequest("Choose an existing category", [{ path: "category", message: "Not found" }]);
}

// Only one article is featured at a time.
async function unfeatureOthers(post) {
  if (post.isFeatured) await BlogPost.updateMany({ _id: { $ne: post._id }, isFeatured: true }, { $set: { isFeatured: false } });
}

async function createPost(req, res) {
  await assertCategory(req.body.category);
  let post;
  try {
    post = await BlogPost.create(preparePost(req.body));
  } catch (err) {
    conflict(err, "slug", "That URL slug is already used by another article");
  }
  await unfeatureOthers(post);
  audit(req, { action: "blogPost.create", resourceId: post._id, after: post, summary: post.title });
  res.status(201).json({ post: post.toAdmin() });
}

async function updatePost(req, res) {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw AppError.notFound("Article not found");
  await assertCategory(req.body.category);
  const before = post.toObject();
  post.set(preparePost(req.body, post));
  try {
    await post.save();
  } catch (err) {
    conflict(err, "slug", "That URL slug is already used by another article");
  }
  await unfeatureOthers(post);
  audit(req, { action: "blogPost.update", resourceId: post._id, before, after: post, summary: post.title });
  res.json({ post: post.toAdmin() });
}

async function deletePost(req, res) {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) throw AppError.notFound("Article not found");
  audit(req, { action: "blogPost.delete", resourceId: post._id, before: { slug: post.slug, title: post.title, status: post.status }, summary: post.title });
  res.status(204).end();
}

async function listCategories(req, res) {
  const cats = await BlogCategory.find().sort({ sortOrder: 1, name: 1 });
  res.json({ categories: cats.map((c) => c.toAdmin()) });
}

async function createCategory(req, res) {
  try {
    res.status(201).json({ category: (await BlogCategory.create(req.body)).toAdmin() });
  } catch (err) {
    conflict(err, "slug", "That category slug already exists");
  }
}

async function updateCategory(req, res) {
  const cat = await BlogCategory.findById(req.params.id);
  if (!cat) throw AppError.notFound("Category not found");
  cat.set(req.body);
  try {
    await cat.save();
  } catch (err) {
    conflict(err, "slug", "That category slug already exists");
  }
  res.json({ category: cat.toAdmin() });
}

async function deleteCategory(req, res) {
  if (await BlogPost.exists({ category: req.params.id })) throw new AppError(409, "CATEGORY_IN_USE", "Move or delete the articles in this category first.");
  const cat = await BlogCategory.findByIdAndDelete(req.params.id);
  if (!cat) throw AppError.notFound("Category not found");
  res.status(204).end();
}

// --- Newsletter & contact -----------------------------------------------------------------------

async function listSubscribers(req, res) {
  const { status, page } = req.validatedQuery;
  const filter = status ? { status } : {};
  const [list, total, counts] = await Promise.all([
    paged(NewsletterSubscriber.find(filter).sort({ createdAt: -1 }).select("email status source confirmedAt unsubscribedAt createdAt"), page),
    NewsletterSubscriber.countDocuments(filter),
    NewsletterSubscriber.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({
    subscribers: list.map((s) => ({ id: String(s._id), email: s.email, status: s.status, source: s.source, confirmedAt: s.confirmedAt ?? null, unsubscribedAt: s.unsubscribedAt ?? null, createdAt: s.createdAt })),
    page,
    pages: pages(total),
    total,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}

async function listContactMessages(req, res) {
  const { status, page } = req.validatedQuery;
  const filter = status ? { status } : {};
  const [list, total, counts] = await Promise.all([
    paged(ContactMessage.find(filter).sort({ createdAt: -1 }), page),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  res.json({ messages: list.map((m) => m.toAdmin()), page, pages: pages(total), total, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
}

async function updateContactMessage(req, res) {
  const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true });
  if (!msg) throw AppError.notFound("Message not found");
  res.json({ message: msg.toAdmin() });
}

module.exports = {
  listReviews,
  moderateReview,
  deleteReview,
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubscribers,
  listContactMessages,
  updateContactMessage,
};
