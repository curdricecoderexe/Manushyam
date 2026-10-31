const express = require("express");
const ctrl = require("../Controller/supportController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiter, limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/support");

function supportRoutes() {
  const router = express.Router();
  const auth = requireAuth;
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  const messageLimit = limiter({ name: "chat-message", windowMs: 60 * 1000, max: 30, keyByUser: true });
  const staff = [requireAuth, requireRole("staff", "admin")];
  const admin = [requireAuth, requireRole("admin")];

  router.get("/notifications", auth, validate({ query: schemas.notificationsQuery }), ctrl.listNotifications);
  router.post("/notifications/read-all", auth, write, ctrl.markAllRead);
  router.post("/notifications/:id/read", auth, write, byId, ctrl.markNotificationRead);

  // Static paths before /chat/:id.
  router.get("/chat/staff/queue", ...staff, ctrl.queue);
  router.get("/chat/staff/active", ...staff, ctrl.myActive);
  router.get("/chat/admin/all", ...admin, validate({ query: schemas.adminChatsQuery }), ctrl.allChats);
  router.post("/chat", auth, messageLimit, validate({ body: schemas.chatOpen }), ctrl.openChat);
  router.get("/chat/mine", auth, ctrl.myChats);
  router.get("/chat/:id", auth, byId, ctrl.getChat);
  router.get("/chat/:id/messages", auth, byId, validate({ query: schemas.historyQuery }), ctrl.chatMessages);
  router.post("/chat/:id/messages", auth, messageLimit, byId, validate({ body: schemas.chatMessage }), ctrl.sendMessage);
  router.post("/chat/:id/close", auth, write, byId, ctrl.closeChat);
  router.post("/chat/:id/reopen", auth, write, byId, ctrl.reopenChat);
  router.post("/chat/:id/read", auth, write, byId, ctrl.readChat);
  router.post("/chat/:id/accept", ...staff, write, byId, ctrl.acceptChat);

  return router;
}

module.exports = { supportRoutes };
