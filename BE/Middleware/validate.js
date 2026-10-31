// Validates and replaces req.body / req.query / req.params with the parsed result.
// Schemas should be .strict() so unknown keys (mass assignment) are rejected.
function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // Express 5 exposes req.query as a getter, so store the parsed copy separately.
        req.validatedQuery = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate };
