const request = require('supertest');
const prisma = require('../../src/db');
const { app, createStudent } = require('../helpers/users');

describe('PATCH /api/profile/me', () => {
  it('updates self-service fields like name and sound', async () => {
    const student = await createStudent();
    const res = await request(app)
      .patch('/api/profile/me')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ name: 'New Name', sound: false });
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(me.body.name).toBe('New Name');
    expect(me.body.sound).toBe(false);
  });

  // Review.md implementation-review item 3: grade used to be self-editable
  // here, and changing it auto-unioned unlockedGrades up to the new value -
  // a student could set grade:9 and instantly "unlock" every grade with zero
  // actual progress. grade is silently ignored now (not a self-service field).
  it('ignores a grade change and does not expand unlockedGrades', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .patch('/api/profile/me')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 9 });
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(me.body.userGrade).toBe(3);
    expect(me.body.unlocked).toEqual([1, 2, 3]);
  });
});

describe('requireAuth role-assignment re-validation', () => {
  // Review.md implementation-review item 6: requireAuth only re-checked
  // User.status before this - the specific RoleAssignment embedded in the
  // access token was trusted for its whole 15-minute lifetime. This checks
  // a route outside auth.js to prove the check lives in the shared
  // middleware, not just auth.js's own handlers.
  it('rejects a request once the caller\'s RoleAssignment has expired, on a non-auth route', async () => {
    const student = await createStudent();
    await prisma.roleAssignment.updateMany({
      where: { userId: student.user.id },
      data: { validUntil: new Date(Date.now() - 1000) }
    });

    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(res.status).toBe(401);
  });
});
