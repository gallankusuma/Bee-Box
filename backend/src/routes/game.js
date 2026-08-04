const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { nextDailyStreak } = require('../utils/dailyStreak');
const { logAction } = require('../utils/auditLog');
const {
  QuestionEngine, GRADE_CONFIG, ACHIEVEMENTS, getTimeLimit, getExamDuration,
  NORMAL_QUESTION_COUNT, EXAM_QUESTION_COUNT
} = require('../../../shared/gradeConfig');

const router = express.Router();

// questionCount is NOT client-controlled (Team_Review.md P0 item 4 - a client
// could otherwise request questionCount=1 to farm XP faster) - it's derived
// server-side from isExam below, regardless of what the request body contains.
const startGameSchema = z.object({
  grade: z.coerce.number().int().refine(g => !!GRADE_CONFIG[g], { message: 'Invalid grade' }),
  subLevel: z.coerce.number().int().min(1).max(5),
  isExam: z.boolean().optional().default(false)
});

const answerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.union([z.string(), z.number()]).nullable().optional()
});

async function getStudentProfileOr404(userId, res) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if(!profile) { res.status(404).json({ error: 'Student profile not found for this account' }); return null; }
  return profile;
}

function publicQuestion(sq) {
  return {
    id: sq.id,
    index: sq.index,
    question: sq.questionText,
    category: sq.category,
    useInput: sq.useInput,
    options: sq.options ? JSON.parse(sq.options) : null
  };
}

// POST /api/game/start - server generates the questions and keeps the answer keys.
router.post('/start', requireAuth, requireRole('STUDENT'), validateBody(startGameSchema), async (req, res) => {
  const profile = await getStudentProfileOr404(req.auth.userId, res);
  if(!profile) return;

  const { grade, subLevel, isExam } = req.body;

  if(!isExam) {
    const unlockedGrades = JSON.parse(profile.unlockedGrades || '[1]');
    if(!unlockedGrades.includes(grade)) return res.status(403).json({ error: `Grade ${grade} is not unlocked yet` });

    const doneCount = await prisma.gradeProgress.count({ where: { studentId: profile.id, grade, done: true } });
    if(subLevel > doneCount + 1) return res.status(403).json({ error: `Sub-level ${subLevel} is locked` });
  }

  const questionCount = isExam ? EXAM_QUESTION_COUNT : NORMAL_QUESTION_COUNT;
  const questions = Array.from({ length: questionCount }, () => QuestionEngine.generate(grade, subLevel));
  if(questions.some(q => !q)) return res.status(500).json({ error: 'Failed to generate questions' });

  // Exam sessions get a hard server-side deadline (Team_Review.md P0 item 5);
  // regular play only has the per-question soft timer scored in /answer.
  const expiresAt = isExam ? new Date(Date.now() + getExamDuration(grade) * 1000) : null;

  const session = await prisma.gameSession.create({
    data: {
      studentId: profile.id,
      grade,
      subLevel,
      isExam,
      expiresAt,
      questions: {
        create: questions.map((q, i) => ({
          index: i,
          questionText: q.question,
          category: q.category,
          answerKey: String(q.answer),
          options: q.options ? JSON.stringify(q.options) : null,
          useInput: q.useInput
        }))
      }
    },
    include: { questions: { orderBy: { index: 'asc' } } }
  });

  if(isExam) {
    await logAction({
      actorUserId: req.auth.userId, action: 'EXAM_STARTED', entityType: 'GameSession',
      entityId: session.id, schoolId: req.auth.schoolId, metadata: { grade, subLevel }, req
    });
  }

  res.status(201).json({
    sessionId: session.id,
    grade, subLevel, isExam,
    timeLimit: isExam ? getExamDuration(grade) : getTimeLimit(grade),
    questions: session.questions.map(publicQuestion)
  });
});

// POST /api/game/:sessionId/answer - checks the submitted answer server-side;
// the client never receives the answer key up front.
router.post('/:sessionId/answer', requireAuth, requireRole('STUDENT'), validateBody(answerSchema), async (req, res) => {
  const profile = await getStudentProfileOr404(req.auth.userId, res);
  if(!profile) return;

  const { sessionId } = req.params;
  const { questionId, answer } = req.body;

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if(!session || session.studentId !== profile.id) return res.status(404).json({ error: 'Session not found' });
  if(session.status !== 'active') return res.status(409).json({ error: 'Session already finished' });

  const now = new Date();
  // Hard server-side deadline for exams (Team_Review.md P0 item 5) - a late
  // answer is rejected outright, not just scored with a smaller speed bonus.
  if(session.isExam && session.expiresAt && session.expiresAt < now) {
    return res.status(410).json({ error: 'Waktu ujian habis', expired: true });
  }

  const question = await prisma.sessionQuestion.findUnique({ where: { id: questionId } });
  if(!question || question.sessionId !== sessionId) return res.status(404).json({ error: 'Question not found' });
  if(question.answeredAt) return res.status(409).json({ error: 'Question already answered' });

  const isCorrect = String(answer ?? '').trim() === String(question.answerKey).trim();

  // Elapsed time is measured server-side from the session's own clock (bumped
  // after every answer) - never trust a client-reported duration for scoring.
  const ms = Math.max(0, now.getTime() - session.lastActivityAt.getTime());

  let scoreEarned = 0;
  if(isCorrect) {
    const basePoints = 15;
    const speedBonus = session.isExam ? 0 : Math.max(0, Math.round((getTimeLimit(session.grade) - ms / 1000) * 1.5));
    scoreEarned = basePoints + speedBonus;
  }

  // Conditional update instead of read-then-write: `answeredAt: null` in the
  // WHERE clause makes this atomic, closing the race where two concurrent
  // requests for the same question both pass the `answeredAt` check above
  // before either write lands (Team_Review.md P0 item 6).
  const claimed = await prisma.sessionQuestion.updateMany({
    where: { id: question.id, answeredAt: null },
    data: { submitted: String(answer ?? ''), isCorrect, answerMs: ms, scoreEarned, answeredAt: now }
  });
  if(claimed.count === 0) return res.status(409).json({ error: 'Question already answered' });

  await prisma.gameSession.update({ where: { id: session.id }, data: { lastActivityAt: now } });

  res.json({ isCorrect, scoreEarned, correctAnswer: isCorrect ? null : question.answerKey });
});

// POST /api/game/:sessionId/finish - server tallies everything from the
// stored questions; duration is computed server-side, never trusted from the client.
router.post('/:sessionId/finish', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await getStudentProfileOr404(req.auth.userId, res);
  if(!profile) return;

  const { sessionId } = req.params;
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { questions: { orderBy: { index: 'asc' } } }
  });
  if(!session || session.studentId !== profile.id) return res.status(404).json({ error: 'Session not found' });
  if(session.status !== 'active') return res.status(409).json({ error: 'Session already finished' });

  const now = new Date();
  // Defensive backstop, not the primary guard: /answer already rejects new
  // answers once an exam is past expiresAt, so this only matters if a write
  // somehow landed in the sliver of time between that check and its own
  // commit. Treat any such answer as not-counted rather than trust it.
  const isLate = q => session.isExam && session.expiresAt && q.answeredAt && q.answeredAt > session.expiresAt;

  const total = session.questions.length;
  const correct = session.questions.filter(q => q.isCorrect === true && !isLate(q)).length;
  const wrong = total - correct;
  const score = session.questions.reduce((sum, q) => sum + (isLate(q) ? 0 : (q.scoreEarned || 0)), 0);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const duration = Math.round((now.getTime() - session.createdAt.getTime()) / 1000);

  let maxStreak = 0, running = 0;
  for(const q of session.questions) {
    running = (q.isCorrect === true && !isLate(q)) ? running + 1 : 0;
    maxStreak = Math.max(maxStreak, running);
  }

  const xpEarned = score + correct * 5 + (accuracy === 100 ? 50 : 0);

  // Everything below runs in one transaction, gated by a conditional update
  // that only one concurrent /finish call for this session can win - closes
  // the double-XP/double-achievement race (Team_Review.md P0 item 6). If the
  // gate isn't won, nothing else in here executes and nothing is written.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.gameSession.updateMany({
      where: { id: session.id, status: 'active' },
      data: { status: 'finished', score, correct, wrong, accuracy, maxStreak, duration, xpEarned, finishedAt: now }
    });
    if(claimed.count === 0) return { alreadyFinished: true };

    // Re-read the profile inside the transaction - two different sessions
    // for the same student finishing concurrently must not stomp on each
    // other's XP/level with a stale snapshot taken before either committed.
    const freshProfile = await tx.studentProfile.findUnique({ where: { id: profile.id } });

    let xp = freshProfile.xp + xpEarned;
    let level = freshProfile.level;
    while(xp >= level * 1000) level++; // handles multi-level jumps in one game, unlike a plain `if`

    const correctMs = session.questions.filter(q => q.isCorrect === true && !isLate(q)).map(q => q.answerMs || 0);
    const fastestThisSession = correctMs.length ? Math.min(...correctMs) / 1000 : Infinity;

    const { streak, lastPlayedDate } = nextDailyStreak(freshProfile.streak, freshProfile.lastPlayedDate);

    const updatedProfile = await tx.studentProfile.update({
      where: { id: profile.id },
      data: {
        xp, level,
        totalGames: freshProfile.totalGames + 1,
        correctAnswers: freshProfile.correctAnswers + correct,
        totalQuestions: freshProfile.totalQuestions + total,
        maxStreak: Math.max(freshProfile.maxStreak, maxStreak),
        fastestTime: Math.min(freshProfile.fastestTime, fastestThisSession),
        streak, lastPlayedDate
      }
    });

    // --- Non-exam: grade progress stars + next-grade unlock ---
    let gradeUnlocked = null;
    if(!session.isExam) {
      const stars = accuracy === 100 ? 3 : accuracy >= 80 ? 2 : 1;
      const existing = await tx.gradeProgress.findUnique({
        where: { studentId_grade_subLevel: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel } }
      });
      await tx.gradeProgress.upsert({
        where: { studentId_grade_subLevel: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel } },
        create: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel, done: true, stars },
        update: { done: true, stars: Math.max(existing?.stars || 0, stars) }
      });

      const completedCount = await tx.gradeProgress.count({ where: { studentId: profile.id, grade: session.grade, done: true } });
      if(completedCount === 5 && session.grade < 9) {
        const unlockedGrades = JSON.parse(updatedProfile.unlockedGrades || '[1]');
        if(!unlockedGrades.includes(session.grade + 1)) {
          unlockedGrades.push(session.grade + 1);
          await tx.studentProfile.update({ where: { id: profile.id }, data: { unlockedGrades: JSON.stringify(unlockedGrades) } });
          gradeUnlocked = session.grade + 1;
        }
      }
    } else {
      const existingAttempt = await tx.examAttempt.findFirst({ where: { studentId: profile.id, grade: session.grade } });
      if(existingAttempt) {
        await tx.examAttempt.update({
          where: { id: existingAttempt.id },
          data: { completed: true, score: Math.max(existingAttempt.score, score), completedAt: now }
        });
      } else {
        await tx.examAttempt.create({
          data: { studentId: profile.id, grade: session.grade, completed: true, score, completedAt: now }
        });
      }
    }

    // --- Achievements ---
    const alreadyUnlocked = new Set((await tx.studentAchievement.findMany({ where: { studentId: profile.id } })).map(a => a.achievementId));
    const statShim = { totalGames: updatedProfile.totalGames, maxStreak: updatedProfile.maxStreak };
    const historyShim = { accuracy, duration };
    const newAchievements = [];
    for(const ach of ACHIEVEMENTS) {
      if(!alreadyUnlocked.has(ach.id) && ach.cond(statShim, historyShim)) {
        await tx.studentAchievement.create({ data: { studentId: profile.id, achievementId: ach.id } });
        newAchievements.push(ach.id);
      }
    }

    return { alreadyFinished: false, updatedProfile, gradeUnlocked, newAchievements, previousLevel: freshProfile.level };
  });

  if(result.alreadyFinished) return res.status(409).json({ error: 'Session already finished' });

  if(session.isExam) {
    await logAction({
      actorUserId: req.auth.userId, action: 'EXAM_FINISHED', entityType: 'GameSession',
      entityId: session.id, schoolId: req.auth.schoolId, metadata: { score, correct, wrong, accuracy }, req
    });
  }

  res.json({
    score, correct, wrong, total, accuracy, duration, maxStreak, xpEarned,
    xp: result.updatedProfile.xp, level: result.updatedProfile.level, leveledUp: result.updatedProfile.level > result.previousLevel,
    streak: result.updatedProfile.streak,
    newAchievements: result.newAchievements, gradeUnlocked: result.gradeUnlocked
  });
});

module.exports = router;
