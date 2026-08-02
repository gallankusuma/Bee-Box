const { rateLimit } = require('express-rate-limit');

// The integration suite hits these endpoints far more than any real client
// would within one window; rate limiting itself has its own dedicated test
// (see tests/unit/rateLimit.test.js) so skipping it elsewhere doesn't lose
// coverage.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Login/register/refresh - guards against credential brute-forcing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, please try again later' }
});

// Join-by-code endpoints (class join code, parent link code) - these are
// short, human-typed codes and are the review's explicit brute-force concern.
const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, please try again later' }
});

module.exports = { authLimiter, codeLimiter };
