// Validates req.body against a zod schema, replacing it with the parsed
// (trimmed/coerced/defaulted) result so downstream handlers can trust the shape.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if(!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({ error: `${firstIssue.path.join('.') || 'body'}: ${firstIssue.message}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
