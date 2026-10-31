const { logger } = require("../Utils/logger");

// Fire-and-forget email jobs: the response never waits on SMTP or PDF rendering.
// In-process for now; a durable queue (BullMQ on Redis) can replace this without touching callers.
const pending = new Set();

function enqueue(name, job) {
  const run = new Promise((resolve) => setImmediate(resolve))
    .then(job)
    .catch((err) => logger.error({ err: err.message, job: name }, "Email job failed"))
    .finally(() => pending.delete(run));
  pending.add(run);
}

// Tests (and graceful shutdown) wait for queued emails to finish.
async function drainMailQueue() {
  while (pending.size) await Promise.all([...pending]);
}

module.exports = { enqueue, drainMailQueue };
