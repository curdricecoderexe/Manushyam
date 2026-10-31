const { Product } = require("../Models/Product");
const { HeroSlide, Faq, Page, Settings } = require("../Models/Content");
const data = require("../Data/catalogSeed");
const blog = require("../Data/blogSeed");
const { BlogCategory, BlogPost } = require("../Models/Blog");
const { preparePost } = require("./blog");

// Inserts launch content that isn't there yet. Never overwrites edits made through the admin panel.
async function seedCatalog() {
  const created = { products: 0, heroSlides: 0, faqs: 0, pages: 0, blogCategories: 0, blogPosts: 0 };

  for (const p of data.products) {
    if (!(await Product.exists({ slug: p.slug }))) {
      // create() (not insertMany) so validation and derived fields (priceFrom, inStock) apply.
      await Product.create(p);
      created.products += 1;
    }
  }
  if ((await HeroSlide.estimatedDocumentCount()) === 0) {
    await HeroSlide.insertMany(data.heroSlides);
    created.heroSlides = data.heroSlides.length;
  }
  if ((await Faq.estimatedDocumentCount()) === 0) {
    await Faq.insertMany(data.faqs);
    created.faqs = data.faqs.length;
  }
  for (const page of data.pages) {
    if (!(await Page.exists({ slug: page.slug }))) {
      await Page.create(page);
      created.pages += 1;
    }
  }
  await Settings.updateOne({ _id: "site" }, { $setOnInsert: data.settings }, { upsert: true });

  for (const c of blog.categories) {
    const res = await BlogCategory.updateOne({ slug: c.slug }, { $setOnInsert: c }, { upsert: true });
    created.blogCategories += res.upsertedCount;
  }
  const catIds = new Map((await BlogCategory.find({ slug: { $in: blog.categories.map((c) => c.slug) } })).map((c) => [c.slug, c._id]));
  for (const { category, ...post } of blog.posts) {
    if (await BlogPost.exists({ slug: post.slug })) continue;
    // Seeded HTML goes through the same sanitiser as admin edits.
    await BlogPost.create(preparePost({ ...post, status: "published", publishAt: new Date(post.publishAt), category: catIds.get(category) }));
    created.blogPosts += 1;
  }
  return created;
}

module.exports = { seedCatalog };
