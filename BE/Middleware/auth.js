const { verifyAccessToken } = require("../Services/tokens");
const { getAuthUser } = require("../Services/userCache");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");

// Verifies the Bearer access token and that the account is still active and the token not revoked.
async function requireAuth(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw AppError.unauthorized();

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new AppError(401, "TOKEN_INVALID", "Your session has expired. Please sign in again.");
    }

    const user = await getAuthUser(claims.sub);
    if (!user || user.deletedAt || !user.isActive || user.tokenVersion !== claims.tv) {
      throw new AppError(401, "TOKEN_INVALID", "Your session has expired. Please sign in again.");
    }
    req.user = { id: claims.sub, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Attaches req.user when a valid access token is sent; otherwise carries on anonymously.
function optionalAuth(req, res, next) {
  if (!req.get("authorization")) return next();
  return requireAuth(req, res, (err) => {
    if (err) req.user = undefined;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}

// CSRF defence for routes authenticated by the refresh cookie: the request must come from our own site.
function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && getEnv().corsOrigins.includes(origin)) return next();
  return next(AppError.forbidden("Request origin not allowed"));
}

module.exports = { requireAuth, optionalAuth, requireRole, requireTrustedOrigin };
