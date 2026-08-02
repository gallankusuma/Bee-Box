const { ROLES, isValidRole } = require('../../src/utils/roles');

describe('isValidRole', () => {
  it('accepts every role in ROLES', () => {
    ROLES.forEach(role => expect(isValidRole(role)).toBe(true));
  });

  it('rejects unknown roles', () => {
    expect(isValidRole('ADMIN')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });
});
