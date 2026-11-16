const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { logger } = require("../Utils/logger");

// autoIndex is off in production (Config/db.js), so the unique and TTL indexes that several
// security guarantees depend on — one account per email, webhook replay protection, idempotent
// checkout, one coupon use per customer, refresh-token uniqueness, expiry of OTPs and tokens — are
// created here at boot. createIndexes() only adds missing indexes; it never drops anything.
function loadAllModels() {
  const dir = path.join(__dirname, "..", "Models");
  for (const file of fs.readdirSync(dir)) if (file.endsWith(".js")) require(path.join(dir, file));
}

async function ensureIndexes() {
  loadAllModels();
  const names = mongoose.modelNames();
  for (const name of names) {
    try {
      await mongoose.model(name).createIndexes();
    } catch (err) {
      // A conflicting old index (or duplicate data) needs a human; refuse to start without it.
      logger.fatal({ model: name, err: err.message }, "Couldn't create indexes");
      throw err;
    }
  }
  logger.info({ models: names.length }, "Indexes ensured");
}

module.exports = { ensureIndexes };
