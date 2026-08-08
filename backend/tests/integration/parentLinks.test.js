const request = require('supertest');
const prisma = require('../../src/db');
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

  // Review.md implementation-review item 5: two different parents racing to
  // claim the same still-valid code could previously both succeed before
  // either regenerated it, defeating "single-use." Only one concurrent
  // request should win.
  it('only lets one of two concurrent claims on the same code succeed', async () => {
    const student = await createStudent();
    const parentA = await createParent();
    const parentB = await createParent();

    const [resA, resB] = await Promise.all([
      request(app).post('/api/parent-links/claim').set('Authorization', `Bearer ${parentA.accessToken}`).send({ linkCode: student.studentProfile.linkCode }),
      request(app).post('/api/parent-links/claim').set('Authorization', `Bearer ${parentB.accessToken}`).send({ linkCode: student.studentProfile.linkCode })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).not.toBe(201);
  });

  it('rejects claiming the same student twice', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });

    // A successful claim regenerates the student's code (single-use by
    // design - see routes/parentLinks.js), so fetch the fresh one before
    // trying to link the same already-linked pair again.
    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: me.body.linkCode });
    expect(res.status).toBe(409);
  });

  it('regenerates the link code on a successful claim so it cannot be reused', async () => {
    const student = await createStudent();
    const parent = await createParent();
    const originalCode = student.studentProfile.linkCode;
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: originalCode });

    const otherParent = await createParent();
    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${otherParent.accessToken}`)
      .send({ linkCode: originalCode });
    expect(res.status).toBe(404);
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

// Claims a student's code for a parent and approves it as the student, so
// tests that need a VERIFIED relationship don't each re-derive this flow.
async function claimAndApprove(student, parent) {
  await request(app)
    .post('/api/parent-links/claim')
    .set('Authorization', `Bearer ${parent.accessToken}`)
    .send({ linkCode: student.studentProfile.linkCode });
  const pending = await request(app)
    .get('/api/parent-links/pending')
    .set('Authorization', `Bearer ${student.accessToken}`);
  const relationshipId = pending.body.pending[0].id;
  await request(app)
    .post(`/api/parent-links/${relationshipId}/approve`)
    .set('Authorization', `Bearer ${student.accessToken}`);
  return relationshipId;
}

describe('GET /api/parent-links/children', () => {
  it('does not list a still-PENDING claim', async () => {
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
    expect(res.body.children).toEqual([]);
  });

  it('lists a child once the student approves the claim', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await claimAndApprove(student, parent);

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

describe('parent-link approval flow', () => {
  it('a student can reject a pending claim, removing the relationship', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });

    const pending = await request(app)
      .get('/api/parent-links/pending')
      .set('Authorization', `Bearer ${student.accessToken}`);
    expect(pending.body.pending).toHaveLength(1);

    const reject = await request(app)
      .post(`/api/parent-links/${pending.body.pending[0].id}/reject`)
      .set('Authorization', `Bearer ${student.accessToken}`);
    expect(reject.status).toBe(200);

    const children = await request(app)
      .get('/api/parent-links/children')
      .set('Authorization', `Bearer ${parent.accessToken}`);
    expect(children.body.children).toEqual([]);
  });

  it('rejects a stranger approving someone else\'s pending claim', async () => {
    const student = await createStudent();
    const otherStudent = await createStudent();
    const parent = await createParent();
    await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });

    const pending = await request(app)
      .get('/api/parent-links/pending')
      .set('Authorization', `Bearer ${student.accessToken}`);

    const res = await request(app)
      .post(`/api/parent-links/${pending.body.pending[0].id}/approve`)
      .set('Authorization', `Bearer ${otherStudent.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('either side can unlink a VERIFIED relationship', async () => {
    const student = await createStudent();
    const parent = await createParent();
    const relationshipId = await claimAndApprove(student, parent);

    const res = await request(app)
      .delete(`/api/parent-links/${relationshipId}`)
      .set('Authorization', `Bearer ${student.accessToken}`);
    expect(res.status).toBe(200);

    const children = await request(app)
      .get('/api/parent-links/children')
      .set('Authorization', `Bearer ${parent.accessToken}`);
    expect(children.body.children).toEqual([]);
  });

  it('rejects an expired link code', async () => {
    const student = await createStudent();
    const parent = await createParent();
    await prisma.studentProfile.update({
      where: { id: student.studentProfile.id },
      data: { linkCodeExpiresAt: new Date(Date.now() - 1000) }
    });

    const res = await request(app)
      .post('/api/parent-links/claim')
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .send({ linkCode: student.studentProfile.linkCode });
    expect(res.status).toBe(410);
  });
});
