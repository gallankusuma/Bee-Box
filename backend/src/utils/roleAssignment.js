const prisma = require('../db');

// Every user has exactly one RoleAssignment today, so "first valid one" is
// "only". This is the seam a future role-switch endpoint would replace with
// a lookup scoped to whichever roleAssignmentId the client asks to activate.
//
// Returns null (not a throw) when nothing is currently valid - a RoleAssignment
// can be revoked/superseded via validUntil, and callers must be able to treat
// that as "not authenticated" rather than crash. Review.md P1 item 8.
async function getActiveRoleAssignment(userId) {
  const now = new Date();
  return prisma.roleAssignment.findFirst({
    where: { userId, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    orderBy: { validFrom: 'asc' }
  });
}

module.exports = { getActiveRoleAssignment };
