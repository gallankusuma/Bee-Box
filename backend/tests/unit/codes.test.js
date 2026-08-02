const { generateCode } = require('../../src/utils/codes');

describe('generateCode', () => {
  it('generates a 6-character code', () => {
    expect(generateCode()).toHaveLength(6);
  });

  it('never uses visually ambiguous characters (0/O, 1/I/L)', () => {
    const codes = Array.from({ length: 200 }, () => generateCode());
    const ambiguous = /[01ILO]/;
    codes.forEach(code => expect(code).not.toMatch(ambiguous));
  });

  it('generates different codes across calls (not a fixed constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
