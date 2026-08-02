const request = require('supertest');
const prisma = require('../../src/db');
const { app } = require('./users');

let counter = 0;

// Simulates a user's RoleAssignment moving to a different School. There's no
// public "create/switch school" API, so this reaches into Prisma directly
// for *setup*. Updates the existing RoleAssignment row in place -
// getActiveRoleAssignment() always resolves the earliest-created row
// (orderBy validFrom asc), so inserting a second row would be silently
// ignored. Returns a fresh accessToken via the real /login endpoint, since
// the caller's original token still embeds the old schoolId.
async function moveToNewSchool(user) {
  counter += 1;
  const school = await prisma.school.create({ data: { name: `Other School ${counter}`, code: `OTH_${Date.now()}_${counter}` } });
  await prisma.roleAssignment.updateMany({ where: { userId: user.id }, data: { schoolId: school.id } });

  const relogin = await request(app).post('/api/auth/login').send({ username: user.username, password: 'testpass123' });
  if(relogin.status !== 200) throw new Error(`moveToNewSchool relogin failed: ${relogin.status} ${JSON.stringify(relogin.body)}`);
  return { school, accessToken: relogin.body.accessToken };
}

module.exports = { moveToNewSchool };
