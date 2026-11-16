// Creates every missing MongoDB index (run once after deploying, or let server.js do it at boot).
require("dotenv").config({ quiet: true });
const { loadEnv } = require("../Config/env");
const { connectDB, disconnectDB } = require("../Config/db");
const { ensureIndexes } = require("../Config/indexes");

(async () => {
  const env = loadEnv();
  await connectDB(env.MONGODB_URI);
  await ensureIndexes();
  await disconnectDB();
})().catch((err) => {
  console.error(err.message); // eslint-disable-line no-console -- CLI output
  process.exit(1);
});
