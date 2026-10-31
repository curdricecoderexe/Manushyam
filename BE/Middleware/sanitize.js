// Rejects MongoDB operator keys ($gt, $where, a.b) anywhere in user input to block NoSQL injection.
function hasOperatorKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  return Object.keys(value).some((k) => k.startsWith("$") || k.includes(".") || hasOperatorKey(value[k], depth + 1));
}

function rejectMongoOperators(req, res, next) {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query) || hasOperatorKey(req.params)) {
    return res.status(400).json({
      error: { code: "INVALID_INPUT", message: "Request contains disallowed keys", requestId: req.id },
    });
  }
  return next();
}

module.exports = { rejectMongoOperators, hasOperatorKey };
