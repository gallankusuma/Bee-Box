const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';

if(!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set (see .env.example)');
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
