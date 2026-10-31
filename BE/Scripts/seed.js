// Seeds the launch catalogue and storefront content: `npm run seed`. Safe to re-run.
require("dotenv").config();

const { loadEnv } = require("../Config/env");
const { connectDB, disconnectDB } = require("../Config/db");
const { Product } = require("../Models/Product");
const { seedCatalog } = require("../Services/seed");
const { logger } = require("../Utils/logger");

async function main() {
  const env = loadEnv();
  await connectDB(env.MONGODB_URI);
  await Product.syncIndexes();
  const created = await seedCatalog();
  logger.info({ created }, "Seed complete");
  await disconnectDB();
}

main().catch(async (err) => {
  logger.fatal({ err: err.message }, "Seed failed");
  await disconnectDB().catch(() => {});
  process.exit(1);
});
