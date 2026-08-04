const request = require('supertest');
const prisma = require('../../src/db');
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

  // Team_Review.md P0 item 2: public registration must never grant a
  // privileged role - TEACHER/ADMIN only ever come from routes/invites.js
  // or scripts/create-admin.js.
  it('rejects role escalation to TEACHER', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: uniqueUsername('escalate'), password: 'testpass123', role: 'TEACHER', name: 'Sneaky'
    });
    expect(res.status).toBe(400);
  });

  it('rejects role escalation to ADMIN', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: uniqueUsername('escalate'), password: 'testpass123', role: 'ADMIN', name: 'Sneaky'
    });
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

  // Review.md P1 item 7: refresh rotates the token - the old one must stop
  // working immediately, not just eventually expire, so a stolen-then-reused
  // refresh token is only ever good for one use.
  it('invalidates the previous refresh token after rotation', async () => {
    const student = await createStudent();
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: student.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(student.refreshToken);

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: student.refreshToken });
    expect(reuse.status).toBe(401);

    const withNewToken = await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(withNewToken.status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session so its refresh token can no longer be used', async () => {
    const student = await createStudent();
    const logoutRes = await request(app).post('/api/auth/logout').send({ refreshToken: student.refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: student.refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('is idempotent (safe to call with no token or an already-revoked one)', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('revokes every session for the account', async () => {
    const username = uniqueUsername('multidevice');
    const first = await createStudent({ username });
    const secondLogin = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' });

    const logoutAll = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({});
    expect(logoutAll.status).toBe(200);

    const refresh1 = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    const refresh2 = await request(app).post('/api/auth/refresh').send({ refreshToken: secondLogin.body.refreshToken });
    expect(refresh1.status).toBe(401);
    expect(refresh2.status).toBe(401);
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

  // Team_Review.md P0 item 2: an already-issued access token must stop
  // working the moment the account is suspended, not just at its natural
  // 15-minute expiry - requireAuth re-checks status on every request.
  it('rejects an already-issued token once the account is suspended', async () => {
    const student = await createStudent();
    await prisma.user.update({ where: { id: student.user.id }, data: { status: 'SUSPENDED' } });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(res.status).toBe(401);
  });

  // Review.md P1 item 8: getActiveRoleAssignment() must honor validUntil,
  // not just grab the earliest row regardless of whether it's still valid.
  it('rejects a request once the RoleAssignment has expired', async () => {
    const student = await createStudent();
    await prisma.roleAssignment.updateMany({
      where: { userId: student.user.id },
      data: { validUntil: new Date(Date.now() - 1000) }
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(res.status).toBe(401);
  });
});
