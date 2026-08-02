const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { nextDailyStreak } = require('../utils/dailyStreak');
const { QuestionEngine, GRADE_CONFIG, ACHIEVEMENTS, getTimeLimit, getExamDuration } = require('../../../shared/gradeConfig');

const router = express.Router();

const startGameSchema = z.object({
  grade: z.coerce.number().int().refine(g => !!GRADE_CONFIG[g], { message: 'Invalid grade' }),
  subLevel: z.coerce.number().int().min(1).max(5),
  isExam: z.boolean().optional().default(false),
  questionCount: z.coerce.number().int().min(1).max(30).optional().default(10)
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

  const { grade, subLevel, isExam, questionCount } = req.body;

  if(!isExam) {
    const unlockedGrades = JSON.parse(profile.unlockedGrades || '[1]');
    if(!unlockedGrades.includes(grade)) return res.status(403).json({ error: `Grade ${grade} is not unlocked yet` });

    const doneCount = await prisma.gradeProgress.count({ where: { studentId: profile.id, grade, done: true } });
    if(subLevel > doneCount + 1) return res.status(403).json({ error: `Sub-level ${subLevel} is locked` });
  }

  const questions = Array.from({ length: questionCount }, () => QuestionEngine.generate(grade, subLevel));
  if(questions.some(q => !q)) return res.status(500).json({ error: 'Failed to generate questions' });

  const session = await prisma.gameSession.create({
    data: {
      studentId: profile.id,
      grade,
      subLevel,
      isExam,
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

  const question = await prisma.sessionQuestion.findUnique({ where: { id: questionId } });
  if(!question || question.sessionId !== sessionId) return res.status(404).json({ error: 'Question not found' });
  if(question.answeredAt) return res.status(409).json({ error: 'Question already answered' });

  const isCorrect = String(answer ?? '').trim() === String(question.answerKey).trim();

  // Elapsed time is measured server-side from the session's own clock (bumped
  // after every answer) - never trust a client-reported duration for scoring.
  const now = new Date();
  const ms = Math.max(0, now.getTime() - session.lastActivityAt.getTime());

  let scoreEarned = 0;
  if(isCorrect) {
    const basePoints = 15;
    const speedBonus = session.isExam ? 0 : Math.max(0, Math.round((getTimeLimit(session.grade) - ms / 1000) * 1.5));
    scoreEarned = basePoints + speedBonus;
  }

  await prisma.sessionQuestion.update({
    where: { id: question.id },
    data: { submitted: String(answer ?? ''), isCorrect, answerMs: ms, scoreEarned, answeredAt: now }
  });
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

  const total = session.questions.length;
  const correct = session.questions.filter(q => q.isCorrect === true).length;
  const wrong = total - correct;
  const score = session.questions.reduce((sum, q) => sum + (q.scoreEarned || 0), 0);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const duration = Math.round((Date.now() - session.createdAt.getTime()) / 1000);

  let maxStreak = 0, running = 0;
  for(const q of session.questions) {
    running = q.isCorrect === true ? running + 1 : 0;
    maxStreak = Math.max(maxStreak, running);
  }

  const xpEarned = score + correct * 5 + (accuracy === 100 ? 50 : 0);

  await prisma.gameSession.update({
    where: { id: session.id },
    data: { status: 'finished', score, correct, wrong, accuracy, maxStreak, duration, xpEarned, finishedAt: new Date() }
  });

  // --- Roll aggregates into the student profile ---
  let xp = profile.xp + xpEarned;
  let level = profile.level;
  while(xp >= level * 1000) level++; // handles multi-level jumps in one game, unlike a plain `if`

  const correctMs = session.questions.filter(q => q.isCorrect === true).map(q => q.answerMs || 0);
  const fastestThisSession = correctMs.length ? Math.min(...correctMs) / 1000 : Infinity;

  const { streak, lastPlayedDate } = nextDailyStreak(profile.streak, profile.lastPlayedDate);

  const updatedProfile = await prisma.studentProfile.update({
    where: { id: profile.id },
    data: {
      xp, level,
      totalGames: profile.totalGames + 1,
      correctAnswers: profile.correctAnswers + correct,
      totalQuestions: profile.totalQuestions + total,
      maxStreak: Math.max(profile.maxStreak, maxStreak),
      fastestTime: Math.min(profile.fastestTime, fastestThisSession),
      streak, lastPlayedDate
    }
  });

  // --- Non-exam: grade progress stars + next-grade unlock ---
  let gradeUnlocked = null;
  if(!session.isExam) {
    const stars = accuracy === 100 ? 3 : accuracy >= 80 ? 2 : 1;
    const existing = await prisma.gradeProgress.findUnique({
      where: { studentId_grade_subLevel: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel } }
    });
    await prisma.gradeProgress.upsert({
      where: { studentId_grade_subLevel: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel } },
      create: { studentId: profile.id, grade: session.grade, subLevel: session.subLevel, done: true, stars },
      update: { done: true, stars: Math.max(existing?.stars || 0, stars) }
    });

    const completedCount = await prisma.gradeProgress.count({ where: { studentId: profile.id, grade: session.grade, done: true } });
    if(completedCount === 5 && session.grade < 9) {
      const unlockedGrades = JSON.parse(updatedProfile.unlockedGrades || '[1]');
      if(!unlockedGrades.includes(session.grade + 1)) {
        unlockedGrades.push(session.grade + 1);
        await prisma.studentProfile.update({ where: { id: profile.id }, data: { unlockedGrades: JSON.stringify(unlockedGrades) } });
        gradeUnlocked = session.grade + 1;
      }
    }
  } else {
    const existingAttempt = await prisma.examAttempt.findFirst({ where: { studentId: profile.id, grade: session.grade } });
    if(existingAttempt) {
      await prisma.examAttempt.update({
        where: { id: existingAttempt.id },
        data: { completed: true, score: Math.max(existingAttempt.score, score), completedAt: new Date() }
      });
    } else {
      await prisma.examAttempt.create({
        data: { studentId: profile.id, grade: session.grade, completed: true, score, completedAt: new Date() }
      });
    }
  }

  // --- Achievements ---
  const alreadyUnlocked = new Set((await prisma.studentAchievement.findMany({ where: { studentId: profile.id } })).map(a => a.achievementId));
  const statShim = { totalGames: updatedProfile.totalGames, maxStreak: updatedProfile.maxStreak };
  const historyShim = { accuracy, duration };
  const newAchievements = [];
  for(const ach of ACHIEVEMENTS) {
    if(!alreadyUnlocked.has(ach.id) && ach.cond(statShim, historyShim)) {
      await prisma.studentAchievement.create({ data: { studentId: profile.id, achievementId: ach.id } });
      newAchievements.push(ach.id);
    }
  }

  res.json({
    score, correct, wrong, total, accuracy, duration, maxStreak, xpEarned,
    xp: updatedProfile.xp, level: updatedProfile.level, leveledUp: updatedProfile.level > profile.level,
    streak: updatedProfile.streak,
    newAchievements, gradeUnlocked
  });
});

module.exports = router;
