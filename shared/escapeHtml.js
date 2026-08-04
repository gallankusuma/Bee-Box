// Escapes text before it's interpolated into an innerHTML template - any
// name/avatar/etc. coming from the API is untrusted, since it was
// user-supplied at registration/profile-edit time (possibly by a different
// account than the one viewing it - see teacher-web/app.js and
// mobile-app/www/game.js call sites). Review.md P0 item 1 / P3 test checklist.
//
// Loaded as a plain <script> tag by both frontends (global `escapeHtml`), and
// required by backend/tests/unit/escapeHtml.test.js as a CommonJS module -
// the guarded export below makes both work off the same file.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if(typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml };
}
