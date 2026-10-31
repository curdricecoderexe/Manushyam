const mongoose = require("mongoose");
const { logger } = require("../Utils/logger");

mongoose.set("strictQuery", true);
// Indexes are built automatically in dev/test; in production they are created by a migration script.
mongoose.set("autoIndex", process.env.NODE_ENV !== "production");

async function connectDB(uri, { retries = 5, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info({ host: mongoose.connection.host }, "MongoDB connected");
      return mongoose.connection;
    } catch (err) {
      logger.warn({ attempt, err: err.message }, "MongoDB connection failed");
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  return null;
}

async function pingDB() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, pingDB, disconnectDB };
