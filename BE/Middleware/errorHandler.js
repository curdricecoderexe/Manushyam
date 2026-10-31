const { ZodError } = require("zod");
const { AppError } = require("../Utils/AppError");

function notFound(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
}

// Central error handler: stack traces and internal messages never reach the client.
function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };

  if (err instanceof ZodError) {
    status = 400;
    body = {
      code: "VALIDATION_ERROR",
      message: "Some fields are invalid",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  } else if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err.type === "entity.too.large") {
    status = 413;
    body = { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    body = { code: "INVALID_JSON", message: "Request body is not valid JSON" };
  } else if (err.message === "CORS_NOT_ALLOWED") {
    status = 403;
    body = { code: "CORS_NOT_ALLOWED", message: "Origin not allowed" };
  }

  if (status >= 500) {
    (req.log || console).error({ err, requestId: req.id }, "Unhandled error");
  }

  res.status(status).json({ error: { ...body, requestId: req.id } });
}

module.exports = { notFound, errorHandler };
