const { ROLES, PUBLIC_ROLES, isValidRole } = require('../../src/utils/roles');

describe('isValidRole', () => {
  it('accepts every role in ROLES', () => {
    ROLES.forEach(role => expect(isValidRole(role)).toBe(true));
  });

  it('rejects unknown roles', () => {
    expect(isValidRole('SUPERADMIN')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });
});

describe('PUBLIC_ROLES', () => {
  it('excludes TEACHER and ADMIN - those are never self-service', () => {
    expect(PUBLIC_ROLES).not.toContain('TEACHER');
    expect(PUBLIC_ROLES).not.toContain('ADMIN');
  });

  it('includes STUDENT and PARENT', () => {
    expect(PUBLIC_ROLES).toContain('STUDENT');
    expect(PUBLIC_ROLES).toContain('PARENT');
  });
});
