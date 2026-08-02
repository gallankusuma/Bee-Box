const request = require('supertest');
const app = require('../../src/server');

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

async function createTeacher(overrides = {}) {
  const username = overrides.username || uniqueUsername('teacher');
  const res = await request(app).post('/api/auth/register').send({
    password: 'testpass123', role: 'TEACHER', name: 'Test Teacher',
    ...overrides,
    username
  });
  if(res.status !== 201) throw new Error(`createTeacher failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

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

module.exports = { app, uniqueUsername, createStudent, createTeacher, createParent };
