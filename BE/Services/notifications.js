const { Notification } = require("../Models/Notification");
const { User } = require("../Models/User");
const { emit, userRoom } = require("./realtime");
const { enqueue } = require("./mailQueue");
const { logger } = require("../Utils/logger");

// Creates in-app notifications and pushes them to any open tabs. Fire-and-forget: queued so the
// request that triggered it never waits (or fails) because of a notification.
function notify(userIds, { type, title, body, link }) {
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  if (!ids.length) return;
  enqueue("notify", async () => {
    const docs = await Notification.insertMany(ids.map((user) => ({ user, type, title, body, link })));
    for (const doc of docs) emit(userRoom(doc.user), "notification:new", doc.toPublic());
  });
}

// Every active staff member and admin (capped; the team is small).
function notifyStaff(payload) {
  enqueue("notify-staff", async () => {
    const team = await User.find({ role: { $in: ["staff", "admin"] }, isActive: true, deletedAt: { $exists: false } })
      .select("_id")
      .limit(200);
    if (team.length) notify(team.map((u) => u._id), payload);
    else logger.debug("No staff to notify");
  });
}

module.exports = { notify, notifyStaff };
