const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/profile/me - shaped close to the old localStorage `S` object so
// the client migration in a later phase is a straightforward remap, not a rewrite.
router.get('/me', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: req.auth.userId },
    include: {
      user: true,
      gradeProgress: true,
      achievements: true,
      exams: true,
      sessions: { where: { status: 'finished' }, orderBy: { finishedAt: 'desc' }, take: 50 }
    }
  });
  if(!profile) return res.status(404).json({ error: 'Student profile not found' });

  const gp = {};
  for(const row of profile.gradeProgress) {
    if(!gp[row.grade]) gp[row.grade] = { done: 0, subs: {} };
    gp[row.grade].subs[row.subLevel] = { done: row.done, stars: row.stars };
  }
  for(const grade of Object.keys(gp)) {
    gp[grade].done = Object.values(gp[grade].subs).filter(s => s.done).length;
  }

  res.json({
    name: profile.user.name,
    avatar: profile.user.avatar,
    birthdate: profile.birthdate,
    userGrade: profile.grade,
    xp: profile.xp,
    level: profile.level,
    streak: profile.streak,
    maxStreak: profile.maxStreak,
    totalGames: profile.totalGames,
    correctAnswers: profile.correctAnswers,
    totalQuestions: profile.totalQuestions,
    unlocked: JSON.parse(profile.unlockedGrades || '[1]'),
    fastestTime: profile.fastestTime,
    sound: profile.sound,
    vibrate: profile.vibrate,
    gp,
    achievements: Object.fromEntries(profile.achievements.map(a => [a.achievementId, true])),
    exams: profile.exams,
    history: profile.sessions.map(s => ({
      date: s.finishedAt,
      grade: s.grade,
      subLevel: s.subLevel,
      score: s.score,
      correct: s.correct,
      wrong: s.wrong,
      maxStreak: s.maxStreak,
      duration: s.duration,
      accuracy: s.accuracy,
      isExam: s.isExam
    }))
  });
});

module.exports = router;
