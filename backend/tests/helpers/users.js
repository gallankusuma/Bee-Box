const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/server');
const prisma = require('../../src/db');
const { getDefaultSchoolId } = require('../../src/utils/school');

let counter = 0;
function uniqueUsername(prefix) {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

async function createStudent(overrides = {}) {
  const username = overrides.username || uniqueUsername('student');
  const res = await request(app).post('/api/auth/register').send({
    password: 'testpass123', role: 'STUDENT', name: 'Test Student', grade: 3,
    ...overrides,
    username
  });
  if(res.status !== 201) throw new Error(`createStudent failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// TEACHER/ADMIN accounts have no public registration path (routes/invites.js
// and scripts/create-admin.js are the only ways they get created, see
// Team_Review.md P0 item 2) - this reaches into Prisma directly for *setup*,
// same pattern as helpers/schools.js, then logs in through the real endpoint
// so the returned shape matches every other fixture (accessToken/user/etc).
async function createPrivilegedUser(role, overrides = {}) {
  const username = overrides.username || uniqueUsername(role.toLowerCase());
  const password = overrides.password || 'testpass123';
  const name = overrides.name || `Test ${role}`;

  const schoolId = await getDefaultSchoolId();
  const passwordHash = await bcrypt.hash(password, 10);
  const person = await prisma.person.create({ data: { fullName: name } });
  const user = await prisma.user.create({ data: { personId: person.id, username, passwordHash, name, status: 'ACTIVE' } });
  await prisma.roleAssignment.create({ data: { userId: user.id, role, schoolId } });

  const res = await request(app).post('/api/auth/login').send({ username, password });
  if(res.status !== 200) throw new Error(`create${role} login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

function createTeacher(overrides) { return createPrivilegedUser('TEACHER', overrides); }
function createAdmin(overrides) { return createPrivilegedUser('ADMIN', overrides); }

async function createParent(overrides = {}) {
  const username = overrides.username || uniqueUsername('parent');
  const res = await request(app).post('/api/auth/register').send({
    password: 'testpass123', role: 'PARENT', name: 'Test Parent',
    ...overrides,
    username
  });
  if(res.status !== 201) throw new Error(`createParent failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = { app, uniqueUsername, createStudent, createTeacher, createAdmin, createParent };
