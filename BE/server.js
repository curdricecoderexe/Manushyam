require("dotenv").config();

const { loadEnv } = require("./Config/env");
const { connectDB, disconnectDB } = require("./Config/db");
const { createApp } = require("./app");
const { attachSocketServer } = require("./Sockets");
const { logger } = require("./Utils/logger");

async function start() {
  const env = loadEnv();
  await connectDB(env.MONGODB_URI);

  const app = createApp(env);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "ManushyaM API listening");
  });
  // Live chat + notification push share the HTTP server (path /socket.io).
  const io = attachSocketServer(server, env);

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => {
      logger.error("Forced shutdown after 10s");
      process.exit(1);
    }, 10000);
    force.unref();
    // Closes sockets and the HTTP server (in-flight requests finish first).
    io.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err: err.message }, "Failed to start");
  process.exit(1);
});
