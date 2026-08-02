const request = require('supertest');
const { app, createStudent, createTeacher } = require('../helpers/users');
const prisma = require('../../src/db');

describe('POST /api/game/start', () => {
  it('creates a session with questions but never leaks the answer key', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    expect(res.status).toBe(201);
    expect(res.body.questions.length).toBeGreaterThan(0);
    res.body.questions.forEach(q => expect(q.answerKey).toBeUndefined());
  });

  it('blocks a locked sub-level', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 5 }); // sub-level 5 requires 1-4 done first
    expect(res.status).toBe(403);
  });

  it('blocks a role other than STUDENT (unauthorized role access)', async () => {
    const teacher = await createTeacher();
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ grade: 3, subLevel: 1 });
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-range subLevel with 400', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 99 });
    expect(res.status).toBe(400);
  });
});

describe('answer -> finish flow', () => {
  it('scores a correct answer and rolls XP/level/history into the profile', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    const sessionId = start.body.sessionId;

    // Server never sends the answer key to the client - reading it directly
    // from the DB here is a test-only shortcut, not something the app does.
    for(const q of start.body.questions) {
      const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });
      const answerRes = await request(app)
        .post(`/api/game/${sessionId}/answer`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ questionId: q.id, answer: stored.answerKey });
      expect(answerRes.status).toBe(200);
      expect(answerRes.body.isCorrect).toBe(true);
    }

    const finish = await request(app)
      .post(`/api/game/${sessionId}/finish`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({});
    expect(finish.status).toBe(200);
    expect(finish.body.accuracy).toBe(100);
    expect(finish.body.xp).toBeGreaterThan(0);

    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(me.body.totalGames).toBe(1);
    expect(me.body.gp['3'].subs['1'].done).toBe(true);
  });

  it('rejects answering a question that does not belong to the session', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    const res = await request(app)
      .post(`/api/game/${start.body.sessionId}/answer`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ questionId: 'does-not-exist', answer: '1' });
    expect(res.status).toBe(404);
  });

  it('rejects finishing a session that belongs to a different student', async () => {
    const studentA = await createStudent({ grade: 3 });
    const studentB = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${studentA.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    const res = await request(app)
      .post(`/api/game/${start.body.sessionId}/finish`)
      .set('Authorization', `Bearer ${studentB.accessToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
