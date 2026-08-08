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

  // Team_Review.md P0 item 4: questionCount must be server-derived, not
  // client-controlled, or a client could request fewer questions to farm XP faster.
  it('ignores a client-supplied questionCount', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1, questionCount: 1 });
    expect(res.status).toBe(201);
    expect(res.body.questions.length).toBe(10);
  });

  // Review.md implementation-review round 3, item 2: exam start is now
  // examId-based - the server derives grade/eligibility/subLevel from it
  // entirely, isExam/grade are never trusted client booleans/values for an
  // exam start.
  it('rejects an examId outside the student\'s grade+-1 band', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ examId: 'ex_9' }); // grade 9 is nowhere near grade 3
    expect(res.status).toBe(403);
  });

  it('rejects a malformed examId', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ examId: 'not-a-real-exam-id' });
    expect(res.status).toBe(400);
  });

  it('allows an exam for the student\'s own grade via examId', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ examId: 'ex_3' });
    expect(res.status).toBe(201);
  });

  it('ignores grade/subLevel/isExam when examId is present', async () => {
    const student = await createStudent({ grade: 3 });
    const res = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ examId: 'ex_3', grade: 9, subLevel: 5, isExam: false });
    expect(res.status).toBe(201);
    expect(res.body.grade).toBe(3);
    expect(res.body.isExam).toBe(true);
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

  // Review.md P3 test checklist: duplicate-answer, checked sequentially (the
  // existing concurrent-finish test below covers the race; this covers the
  // simpler "just call it twice" case explicitly).
  it('rejects answering the same question twice in a row', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });
    const q = start.body.questions[0];
    const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });

    const first = await request(app)
      .post(`/api/game/${start.body.sessionId}/answer`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ questionId: q.id, answer: stored.answerKey });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/game/${start.body.sessionId}/answer`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ questionId: q.id, answer: stored.answerKey });
    expect(second.status).toBe(409);
  });

  // Review.md implementation-review round 3, item 1: gating just the
  // gradeProgress credit still let a client farm xp/totalGames/streak by
  // starting a session, answering one question, and finishing immediately -
  // repeatable indefinitely. /finish now rejects outright for a regular
  // (non-exam) session with any unanswered question, so nothing gets
  // computed or written at all for an incomplete attempt.
  it('rejects finishing a regular session with unanswered questions, and changes nothing', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    // Answer only the first question, leave the rest untouched, then try to bail.
    const q = start.body.questions[0];
    const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });
    await request(app)
      .post(`/api/game/${start.body.sessionId}/answer`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ questionId: q.id, answer: stored.answerKey });

    const before = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);

    const finish = await request(app)
      .post(`/api/game/${start.body.sessionId}/finish`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({});
    expect(finish.status).toBe(409);
    expect(finish.body.code).toBe('INCOMPLETE_SESSION');

    const after = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(after.body.xp).toBe(before.body.xp);
    expect(after.body.totalGames).toBe(before.body.totalGames);
    expect(after.body.gp['3']?.subs?.['1']?.done).not.toBe(true);

    // The session itself is still open, not consumed by the rejected attempt -
    // answering the rest and finishing for real still works.
    for(const question of start.body.questions.slice(1)) {
      const s = await prisma.sessionQuestion.findUnique({ where: { id: question.id } });
      await request(app)
        .post(`/api/game/${start.body.sessionId}/answer`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ questionId: question.id, answer: s.answerKey });
    }
    const realFinish = await request(app)
      .post(`/api/game/${start.body.sessionId}/finish`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({});
    expect(realFinish.status).toBe(200);
  });

  // Review.md P3 test checklist: duplicate-finish, checked sequentially.
  it('rejects finishing the same session twice in a row', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });

    for(const q of start.body.questions) {
      const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });
      await request(app)
        .post(`/api/game/${start.body.sessionId}/answer`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ questionId: q.id, answer: stored.answerKey });
    }

    const first = await request(app)
      .post(`/api/game/${start.body.sessionId}/finish`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/game/${start.body.sessionId}/finish`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({});
    expect(second.status).toBe(409);
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

  // Team_Review.md P0 item 6: two concurrent /finish calls for the same
  // session (double-tap, retry) must only credit XP once, not twice.
  it('only credits XP once when /finish is called concurrently', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ grade: 3, subLevel: 1 });
    const sessionId = start.body.sessionId;

    for(const q of start.body.questions) {
      const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });
      await request(app)
        .post(`/api/game/${sessionId}/answer`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ questionId: q.id, answer: stored.answerKey });
    }

    const [first, second] = await Promise.all([
      request(app).post(`/api/game/${sessionId}/finish`).set('Authorization', `Bearer ${student.accessToken}`).send({}),
      request(app).post(`/api/game/${sessionId}/finish`).set('Authorization', `Bearer ${student.accessToken}`).send({})
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = first.status === 200 ? first : second;
    const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${student.accessToken}`);
    expect(me.body.xp).toBe(winner.body.xp);
    expect(me.body.totalGames).toBe(1);
  });
});

describe('exam timer enforcement', () => {
  // Team_Review.md P0 item 5: a hard server-side deadline, not just a
  // client-displayed countdown - simulate expiry directly since waiting out
  // a real exam duration in a test would be slow and flaky.
  it('rejects an answer submitted after the exam has expired', async () => {
    const student = await createStudent({ grade: 3 });
    const start = await request(app)
      .post('/api/game/start')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ examId: 'ex_3' });
    const sessionId = start.body.sessionId;

    await prisma.gameSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const q = start.body.questions[0];
    const stored = await prisma.sessionQuestion.findUnique({ where: { id: q.id } });
    const res = await request(app)
      .post(`/api/game/${sessionId}/answer`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ questionId: q.id, answer: stored.answerKey });
    expect(res.status).toBe(410);
    expect(res.body.expired).toBe(true);
  });
});
