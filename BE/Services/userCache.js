const { User } = require("../Models/User");

// Short-lived cache of the fields auth needs per request (role, active, tokenVersion).
// Invalidated whenever those fields change; 60s worst-case staleness across instances.
const TTL_MS = 60 * 1000;
const cache = new Map();

async function getAuthUser(userId) {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.user;
  const user = await User.findById(userId).select("role isActive tokenVersion deletedAt").lean();
  if (user) cache.set(userId, { user, expires: Date.now() + TTL_MS });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return user;
}

function invalidateUser(userId) {
  cache.delete(String(userId));
}

module.exports = { getAuthUser, invalidateUser };
