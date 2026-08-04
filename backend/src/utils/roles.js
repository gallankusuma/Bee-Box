// Validates RoleAssignment.role (and, until the Phase 1 contract migration
// lands, the legacy User.role column it's replacing).
const ROLES = ['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'];

// The only roles POST /auth/register will accept from an anonymous caller.
// TEACHER accounts are provisioned via an ADMIN's invite (routes/invites.js);
// ADMIN accounts are bootstrapped via scripts/create-admin.js. Neither role
// is ever self-service - see Team_Review.md P0 item 2.
const PUBLIC_ROLES = ['STUDENT', 'PARENT'];

function isValidRole(role) {
  return ROLES.includes(role);
}

module.exports = { ROLES, PUBLIC_ROLES, isValidRole };
