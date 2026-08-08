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

// Review.md implementation-review round 3, item 3: a browser response must
// never carry the refresh token in a JS-readable JSON body at all - doing so
// defeats the point of the httpOnly cookie (any XSS on the page could just
// read it off the fetch() response before it's ever near localStorage). Our
// own native client (mobile-app) explicitly identifies itself since it has
// nowhere else to put the token; anything that doesn't send this header is
// treated as a browser and gets the cookie only.
function isNativeClient(req) {
  return req.headers['x-client-platform'] === 'native';
}

module.exports = { setRefreshCookie, clearRefreshCookie, readRefreshToken, isNativeClient };
