const fs = require('fs');
const path = require('path');

// Review.md implementation-review item 7: backend/src/server.js's helmet CSP
// only covers responses the API itself serves - the static frontends need
// their own <meta> CSP. This is a lightweight regression guard, not a real
// CSP validator - it just makes sure the tag doesn't silently disappear.
describe('static frontend CSP meta tags', () => {
  it('teacher-web/index.html declares a Content-Security-Policy', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../../teacher-web/index.html'), 'utf8');
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);
  });

  it('mobile-app/www/index.html declares a Content-Security-Policy', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../../mobile-app/www/index.html'), 'utf8');
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);
  });
});
