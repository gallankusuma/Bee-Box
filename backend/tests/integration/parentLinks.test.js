const request = require('supertest');
const { app, createStudent, createParent, createTeacher } = require('../helpers/users');
const { moveToNewSchool } = require('../helpers/schools');

describe('POST /api/parent-links/claim', () => {
  it('links a parent to a student by link code', async () => {
    const student = await createStudent();
    const parent = await createParent();
    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });
    expect(res.status).toBe(201);
    expect(res.body.studentName).toBe(student.user.name);
  });

  it('rejects claiming the same student twice', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });

    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });
    expect(res.status).toBe(409);
  });

  it('rejects an unknown link code', async () => {
    const parent = await createParent();
    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: 'ZZZZZZ' });
    expect(res.status).toBe(404);
  });

  it('blocks a non-parent role (unauthorized role access)', async () => {
    const teacher = await createTeacher();
    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ linkCode: 'ABCDEF' });
    expect(res.status).toBe(403);
  });

  // Pins the intentional decision in routes/parentLinks.js: unlike class-join,
  // parent-child linking is NOT scoped by school (families can span schools).
  // This must keep passing - if it ever starts failing, someone scoped this
  // route by schoolId without updating the documented decision.
  it('allows linking across schools by design (families can span schools)', async () => {
    const student = await createStudent();
    const parent = await createParent();
    const { accessToken } = await moveToNewSchool(parent.user);

    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/parent-links/children', () => {
  it('lists linked children with their progress summary', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });

    const res = await request(app)
      .get('/api/parent-links/children')
      .set('Authorization', `Bearer ${parent.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.children).toHaveLength(1);
    expect(res.body.children[0].studentId).toBe(student.studentProfile.id);
  });

  it('returns an empty list for a parent with no linked children', async () => {
    const parent = await createParent();
    const res = await request(app)
      .get('/api/parent-links/children')
      .set('Authorization', `Bearer ${parent.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.children).toEqual([]);
  });
});
