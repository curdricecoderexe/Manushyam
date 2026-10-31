const { z } = require("zod");
const { CHAT_STATUSES } = require("../Models/Chat");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not found");

const schemas = {
  idParam: z.object({ id: objectId }).strict(),
  notificationsQuery: z.object({ unread: z.enum(["1", "0"]).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict(),
  chatOpen: z
    .object({
      message: z.string().max(2000).optional(),
      topic: z.string().trim().max(80).optional(),
      orderNumber: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^MM\d{6}-[A-Z0-9]{5}$/)
        .optional(),
      clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
    })
    .strict(),
  chatMessage: z.object({ body: z.string().max(4000), clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() }).strict(),
  historyQuery: z.object({ before: z.coerce.date().optional() }).strict(),
  adminChatsQuery: z.object({ status: z.enum(CHAT_STATUSES).optional(), page: z.coerce.number().int().min(1).max(500).default(1) }).strict(),
};

module.exports = { schemas };
