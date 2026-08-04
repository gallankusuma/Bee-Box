// Duplicated from shared/escapeHtml.js (kept as a local copy, not loaded via
// a ../shared/ reference) because teacher-web is deployed as its own static
// site root - anything outside this folder 404s once it's not being served
// from the monorepo checkout. Keep this in sync with shared/escapeHtml.js
// if either changes; the canonical/tested copy lives there
// (backend/tests/unit/escapeHtml.test.js).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
