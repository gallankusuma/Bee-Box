const prisma = require('../db');
const { REFRESH_TTL_MS } = require('./jwt');

// Creates the DB-backed counterpart to a refresh JWT - its id is embedded as
// the token's `jti` so /auth/refresh can check revocation state that a JWT
// signature alone can't express. Review.md P1 item 7.
//
// Accepts an optional `client` (a $transaction callback's `tx`) - SQLite
// only allows one writer at a time, so calling this with the default `prisma`
// client from inside another $transaction would deadlock (the outer
// transaction's write lock never releases because it's waiting on this call,
// which is waiting on a second connection for the same lock).
async function createSession(userId, req, client = prisma) {
  return client.session.create({
    data: {
      userId,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    }
  });
}

module.exports = { createSession };
