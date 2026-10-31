const { randomUUID } = require("crypto");

// Always server-generated; an inbound X-Request-ID is ignored so clients can't spoof log correlation.
function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
}

module.exports = { requestId };
