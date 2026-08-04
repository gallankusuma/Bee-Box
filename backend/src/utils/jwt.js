const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

if(!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set (see .env.example)');
}

function signAccessToken(user, roleAssignment) {
  const payload = { sub: user.id, role: roleAssignment.role, schoolId: roleAssignment.schoolId, raid: roleAssignment.id };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(user, sessionId) {
  return jwt.sign({ sub: user.id, jti: sessionId }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

// Logout needs the session id (jti) out of an already-expired refresh token
// too - ignoring expiration is safe here because the signature is still
// checked, so a forged jti still can't revoke someone else's session.
function decodeExpiredRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, { ignoreExpiration: true });
}

module.exports = {
  signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken,
  decodeExpiredRefreshToken, REFRESH_TTL_MS
};
