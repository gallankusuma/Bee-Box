const prisma = require('../db');

// Every user has exactly one RoleAssignment today, so "first" is "only".
// This is the seam a future role-switch endpoint would replace with a lookup
// scoped to whichever roleAssignmentId the client asks to activate.
async function getActiveRoleAssignment(userId) {
  const assignment = await prisma.roleAssignment.findFirst({ where: { userId }, orderBy: { validFrom: 'asc' } });
  if(!assignment) throw new Error(`No RoleAssignment found for user ${userId}`);
  return assignment;
}

module.exports = { getActiveRoleAssignment };
