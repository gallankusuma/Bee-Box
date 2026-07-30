// Validates RoleAssignment.role (and, until the Phase 1 contract migration
// lands, the legacy User.role column it's replacing).
const ROLES = ['STUDENT', 'PARENT', 'TEACHER'];

function isValidRole(role) {
  return ROLES.includes(role);
}

module.exports = { ROLES, isValidRole };
