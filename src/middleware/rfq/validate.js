// src/middleware/rfq/validate.js

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];

      if (
        rules.required &&
        (value === undefined || value === null || value === '')
      ) {
        errors.push({ path: field, message: `${field} is required` });
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (rules.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push({ path: field, message: `${field} must be an array` });
        }
        continue;
      }

      if (rules.type && typeof value !== rules.type) {
        errors.push({
          path: field,
          message: `${field} must be a ${rules.type}`,
        });
        continue;
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({
          path: field,
          message: `${field} must be one of: ${rules.enum.join(', ')}`,
        });
        continue;
      }

      if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ path: field, message: 'Must be a valid email address' });
        continue;
      }

      if (rules.max && typeof value === 'string' && value.length > rules.max) {
        errors.push({
          path: field,
          message: `${field} must be at most ${rules.max} characters`,
        });
      }
    }

    if (errors.length) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    next();
  };
}

module.exports = { validateBody };