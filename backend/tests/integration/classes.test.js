const request = require('supertest');
const { app, createStudent, createTeacher } = require('../helpers/users');
const { moveToNewSchool } = require('../helpers/schools');

describe('POST /api/classes (role access)', () => {
  it('lets a teacher create a class with a join code', async () => {
    const teacher = await createTeacher();
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Test', grade: 3 });
    expect(res.status).toBe(201);
    expect(res.body.joinCode).toHaveLength(6);
  });

  it('blocks a student from creating a class (unauthorized role access)', async () => {
    const student = await createStudent();
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ name: 'Kelas Test', grade: 3 });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid grade with 400', async () => {
    const teacher = await createTeacher();
    const res = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Test', grade: 999 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/classes/join', () => {
  it('lets a student join with a valid join code', async () => {
    const teacher = await createTeacher();
    const created = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Join', grade: 3 });

    const student = await createStudent();
    const res = await request(app)
      .post('/api/classes/join')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ joinCode: created.body.joinCode });
    expect(res.status).toBe(201);
    expect(res.body.className).toBe('Kelas Join');
  });

  it('rejects an unknown join code', async () => {
    const student = await createStudent();
    const res = await request(app)
      .post('/api/classes/join')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ joinCode: 'ZZZZZZ' });
    expect(res.status).toBe(404);
  });
});

describe('class ownership', () => {
  it('blocks a teacher from viewing another teacher\'s class (cross-teacher access)', async () => {
    const teacherA = await createTeacher();
    const teacherB = await createTeacher();
    const created = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacherA.accessToken}`)
      .send({ name: 'Kelas A', grade: 3 });

    const res = await request(app)
      .get(`/api/classes/${created.body.id}`)
      .set('Authorization', `Bearer ${teacherB.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('removes a student from the roster without touching their account', async () => {
    const teacher = await createTeacher();
    const created = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Remove', grade: 3 });

    const student = await createStudent();
    await request(app)
      .post('/api/classes/join')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ joinCode: created.body.joinCode });

    const remove = await request(app)
      .delete(`/api/classes/${created.body.id}/students/${student.studentProfile.id}`)
      .set('Authorization', `Bearer ${teacher.accessToken}`);
    expect(remove.status).toBe(200);

    // Student's own account/login is unaffected.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(me.status).toBe(200);
  });
});

describe('tenant isolation', () => {
  // These hold teacherId/studentId constant and vary only schoolId - a
  // generic "two different teachers" test would 404 on the ownership check
  // alone and prove nothing about the schoolId check specifically.

  it('excludes a teacher\'s own class from GET / after their RoleAssignment moves to another school', async () => {
    const teacher = await createTeacher();
    await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Lama', grade: 3 });

    const { accessToken } = await moveToNewSchool(teacher.user);
    const res = await request(app).get('/api/classes').set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.classes).toHaveLength(0);
  });

  it('blocks a teacher from GET/PATCH/DELETE on their own class after moving to another school', async () => {
    const teacher = await createTeacher();
    const created = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas Lama', grade: 3 });

    const { accessToken } = await moveToNewSchool(teacher.user);

    const get = await request(app).get(`/api/classes/${created.body.id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/classes/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Renamed' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/classes/${created.body.id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(404);
  });

  it('blocks a student in another school from joining via a code valid only in their old school', async () => {
    const teacher = await createTeacher();
    const created = await request(app)
      .post('/api/classes')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ name: 'Kelas A', grade: 3 });

    const student = await createStudent();
    const { accessToken } = await moveToNewSchool(student.user);
    const res = await request(app)
      .post('/api/classes/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ joinCode: created.body.joinCode });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Class not found for that code'); // identical to "unknown code" - no leak
  });
});
