const request = require('supertest');
const { app, uniqueUsername, createStudent, createAdmin } = require('../helpers/users');

describe('POST /api/invites/teacher', () => {
  it('lets an ADMIN create a teacher invite', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/invites/teacher')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'New Teacher' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('blocks a non-ADMIN from creating an invite (unauthorized role access)', async () => {
    const student = await createStudent();
    const res = await request(app)
      .post('/api/invites/teacher')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ name: 'New Teacher' });
    expect(res.status).toBe(403);
  });
});

describe('GET/POST /api/invites/teacher/:token', () => {
  it('accepting an invite creates a TEACHER account and logs in', async () => {
    const admin = await createAdmin();
    const create = await request(app)
      .post('/api/invites/teacher')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Invited Teacher' });

    const info = await request(app).get(`/api/invites/teacher/${create.body.token}`);
    expect(info.status).toBe(200);
    expect(info.body.name).toBe('Invited Teacher');

    const username = uniqueUsername('accepted');
    const accept = await request(app)
      .post(`/api/invites/teacher/${create.body.token}/accept`)
      .send({ username, password: 'testpass123' });
    expect(accept.status).toBe(201);
    expect(accept.body.user.role).toBe('TEACHER');
    expect(accept.body.accessToken).toEqual(expect.any(String));

    const login = await request(app).post('/api/auth/login').send({ username, password: 'testpass123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('TEACHER');
  });

  it('rejects accepting the same invite twice', async () => {
    const admin = await createAdmin();
    const create = await request(app)
      .post('/api/invites/teacher')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Invited Teacher' });

    await request(app)
      .post(`/api/invites/teacher/${create.body.token}/accept`)
      .send({ username: uniqueUsername('once'), password: 'testpass123' });

    const res = await request(app)
      .post(`/api/invites/teacher/${create.body.token}/accept`)
      .send({ username: uniqueUsername('twice'), password: 'testpass123' });
    expect(res.status).toBe(404);
  });

  it('rejects an unknown invite token', async () => {
    const res = await request(app).get('/api/invites/teacher/not-a-real-token');
    expect(res.status).toBe(404);
  });

  // Review.md implementation-review item 5: two concurrent accept requests
  // for the same token could previously both read status:'PENDING' before
  // either committed, creating two TEACHER accounts from one invite.
  it('only lets one of two concurrent accept requests for the same token succeed', async () => {
    const admin = await createAdmin();
    const create = await request(app)
      .post('/api/invites/teacher')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Contested Teacher' });

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/invites/teacher/${create.body.token}/accept`).send({ username: uniqueUsername('race_a'), password: 'testpass123' }),
      request(app).post(`/api/invites/teacher/${create.body.token}/accept`).send({ username: uniqueUsername('race_b'), password: 'testpass123' })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).not.toBe(201);
  });
});
