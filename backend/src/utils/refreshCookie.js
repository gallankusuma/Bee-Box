const { REFRESH_TTL_MS } = require('./jwt');

// teacher-web only (mobile-app never sends credentials:'include', so this
// cookie is simply invisible to it - it keeps using the refreshToken in the
// JSON body as before). Review.md P1 item 12.
const COOKIE_NAME = 'refreshToken';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Secure cookies are dropped over plain HTTP, which local dev uses.
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth'
  };
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_TTL_MS });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Cookie takes priority (teacher-web); falls back to the body (mobile-app).
function readRefreshToken(req) {
  return (req.cookies && req.cookies[COOKIE_NAME]) || req.body.refreshToken;
}

module.exports = { setRefreshCookie, clearRefreshCookie, readRefreshToken };
