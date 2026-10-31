const { Server } = require("socket.io");
const { z } = require("zod");
const { verifyAccessToken } = require("../Services/tokens");
const { getAuthUser } = require("../Services/userCache");
const chat = require("../Services/chat");
const { setIo, userRoom, chatRoom, STAFF_ROOM } = require("../Services/realtime");
const { logger } = require("../Utils/logger");

// Per-socket token bucket: bursts of 10 events, refilling at 1 per second.
const BUCKET_SIZE = 10;
const REFILL_PER_MS = 1 / 1000;

function takeToken(socket) {
  const b = socket.data.bucket;
  const now = Date.now();
  b.tokens = Math.min(BUCKET_SIZE, b.tokens + (now - b.at) * REFILL_PER_MS);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

const chatId = z.string().regex(/^[a-f\d]{24}$/i);
const schemas = {
  join: z.object({ chatId }).strict(),
  send: z.object({ chatId, body: z.string().max(4000), clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() }).strict(),
  typing: z.object({ chatId }).strict(),
};

// Confirms the account is still active and the token not revoked or expired. Runs at the handshake
// and again before every event, so a deactivated user or "sign out everywhere" takes effect live.
async function checkSession(socket) {
  const { claims } = socket.data;
  if (claims.exp * 1000 <= Date.now()) return "expired";
  const user = await getAuthUser(claims.sub);
  if (!user || user.deletedAt || !user.isActive || user.tokenVersion !== claims.tv) return "revoked";
  // A role change (e.g. staff demoted) applies to the next event.
  socket.data.user.role = user.role;
  if (!["staff", "admin"].includes(user.role)) socket.leave(STAFF_ROOM);
  return null;
}

function attachSocketServer(httpServer, env) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const claims = verifyAccessToken(String(socket.handshake.auth?.token ?? ""));
      const user = await getAuthUser(claims.sub);
      if (!user || user.deletedAt || !user.isActive || user.tokenVersion !== claims.tv) throw new Error("revoked");
      socket.data.user = { id: claims.sub, role: user.role };
      socket.data.claims = claims;
      socket.data.bucket = { tokens: BUCKET_SIZE, at: Date.now() };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket.data;
    socket.join(userRoom(user.id));
    if (chat.isStaff(user)) socket.join(STAFF_ROOM);

    // Wraps every client event: session check, rate limit, payload validation, errors → ack.
    const on = (event, schema, handler) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          const problem = await checkSession(socket);
          if (problem) {
            socket.emit("auth:expired", { reason: problem });
            socket.disconnect(true);
            return;
          }
          if (!takeToken(socket)) {
            reply({ ok: false, error: { code: "RATE_LIMITED", message: "You’re sending messages too fast. Please slow down." } });
            return;
          }
          const parsed = schema.safeParse(payload ?? {});
          if (!parsed.success) {
            reply({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid request" } });
            return;
          }
          reply({ ok: true, ...((await handler(parsed.data)) ?? {}) });
        } catch (err) {
          if (!err.expose) logger.error({ err, event }, "Socket handler failed");
          reply({ ok: false, error: { code: err.expose ? err.code : "INTERNAL_ERROR", message: err.expose ? err.message : "Something went wrong. Please try again." } });
        }
      });
    };

    on("chat:join", schemas.join, async ({ chatId: id }) => {
      await chat.loadChat(id, user); // access check (throws "not found" for someone else's chat)
      socket.join(chatRoom(id));
      return { chatId: id };
    });

    on("chat:leave", schemas.join, async ({ chatId: id }) => {
      socket.leave(chatRoom(id));
    });

    on("chat:send", schemas.send, async ({ chatId: id, body, clientId }) => {
      const msg = await chat.postMessage(id, user, { body, clientId });
      return { message: msg.toPublic() };
    });

    on("chat:typing", schemas.typing, async ({ chatId: id }) => {
      if (!socket.rooms.has(chatRoom(id))) return;
      socket.to(chatRoom(id)).emit("chat:typing", { chatId: id, role: chat.isStaff(user) ? "staff" : "customer" });
    });

    on("chat:read", schemas.join, async ({ chatId: id }) => {
      await chat.markRead(id, user);
    });
  });

  setIo(io);
  if (env.REDIS_URL) attachRedisAdapter(io, env.REDIS_URL);
  return io;
}

// Multiple API instances share rooms through Redis pub/sub. Connection errors are logged, not fatal.
async function attachRedisAdapter(io, url) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const { createClient } = require("redis");
    const pub = createClient({ url });
    const sub = pub.duplicate();
    pub.on("error", (err) => logger.error({ err: err.message }, "Redis (socket pub) error"));
    sub.on("error", (err) => logger.error({ err: err.message }, "Redis (socket sub) error"));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    logger.info("Socket.IO Redis adapter attached");
  } catch (err) {
    logger.error({ err: err.message }, "Couldn't attach the Socket.IO Redis adapter; running single-instance");
  }
}

module.exports = { attachSocketServer, BUCKET_SIZE };
