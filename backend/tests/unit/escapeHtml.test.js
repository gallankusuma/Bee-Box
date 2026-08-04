const { escapeHtml } = require('../../../shared/escapeHtml');

describe('escapeHtml', () => {
  it('neutralizes a <script> payload', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutralizes an event-handler-breakout payload', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toMatch(/<img/);
    expect(out).not.toContain('"');
  });

  it('neutralizes a quote-breakout payload', () => {
    const out = escapeHtml(`"><svg onload=alert(1)>`);
    expect(out).not.toContain('"');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Budi Santoso')).toBe('Budi Santoso');
  });

  it('handles null/undefined safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
