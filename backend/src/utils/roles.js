const ROLES = ['STUDENT', 'PARENT', 'TEACHER'];

function isValidRole(role) {
  return ROLES.includes(role);
}

module.exports = { ROLES, isValidRole };
