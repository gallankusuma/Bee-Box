const request = require('supertest');
const { app, uniqueUsername, createStudent } = require('../helpers/users');

describe('POST /api/auth/register', () => {
  it('registers a student and returns tokens + role', async () => {
    const student = await createStudent();
    expect(student.user.role).toBe('STUDENT');
    expect(student.accessToken).toEqual(expect.any(String));
    expect(student.refreshToken).toEqual(expect.any(String));
    expect(student.studentProfile.linkCode).toHaveLength(6);
  });

  it('rejects a duplicate username', async () => {
    const username = uniqueUsername('dup');
    await createStudent({ username });
    const res = await request(app).post('/api/auth/register').send({
      username, password: 'testpass123', role: 'STUDENT', name: 'Dup', grade: 3
    });
    expect(res.status).toBe(409);
  });

  it('rejects invalid input with 400, not a 500', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: '123', role: 'ALIEN', name: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const username = uniqueUsername('loginok');
    await createStudent({ username });
    const res = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    const username = uniqueUsername('loginbad');
    await createStudent({ username });
    const res = await request(app).post('/api/auth/login').send({ username, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects a nonexistent user', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nobody_here', password: 'whatever1' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token for a valid refresh token', async () => {
    const student = await createStudent();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: student.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a garbage refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const student = await createStudent();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(student.user.id);
  });

  it('rejects a request with no token (unauthorized access)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a request with a bogus token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });
});
