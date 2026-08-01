const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { GRADE_CONFIG, getExamDuration } = require('../../../shared/gradeConfig');
const { dateKey } = require('../utils/dailyStreak');

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
    linkCode: profile.linkCode,
    sound: profile.sound,
    vibrate: profile.vibrate,
    lastPlayedDate: profile.lastPlayedDate,
    playedToday: profile.lastPlayedDate === dateKey(new Date()),
    gp,
    achievements: Object.fromEntries(profile.achievements.map(a => [a.achievementId, a.unlockedAt])),
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

// PATCH /api/profile/me - settings + profile-modal edits (name, avatar, sound,
// vibrate, birthdate, grade). Changing grade re-runs the unlock merge server-side,
// same rule as the old client's setupGradeUnlocks().
router.patch('/me', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found' });

  const { name, avatar, sound, vibrate, birthdate, grade } = req.body || {};
  const userData = {};
  if(typeof name === 'string' && name.trim()) userData.name = name.trim();
  if(typeof avatar === 'string' && avatar) userData.avatar = avatar;
  if(Object.keys(userData).length) {
    await prisma.user.update({ where: { id: req.auth.userId }, data: userData });
  }

  const profileData = {};
  if(typeof sound === 'boolean') profileData.sound = sound;
  if(typeof vibrate === 'boolean') profileData.vibrate = vibrate;
  if(typeof birthdate === 'string') profileData.birthdate = birthdate;

  if(grade !== undefined) {
    const gradeNum = parseInt(grade, 10);
    if(!GRADE_CONFIG[gradeNum]) return res.status(400).json({ error: 'Invalid grade' });
    profileData.grade = gradeNum;
    const unlocked = new Set(JSON.parse(profile.unlockedGrades || '[1]'));
    for(let i = 1; i <= gradeNum; i++) unlocked.add(i);
    profileData.unlockedGrades = JSON.stringify([...unlocked].sort((a, b) => a - b));
  }

  if(Object.keys(profileData).length) {
    await prisma.studentProfile.update({ where: { id: profile.id }, data: profileData });
  }

  res.json({ ok: true });
});

// GET /api/profile/exams - available exams for the student's grade band
// (grade-1, grade, grade+1), cross-referenced with any ExamAttempt for completed/score.
router.get('/exams', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found' });

  const grades = [profile.grade];
  if(profile.grade > 1) grades.unshift(profile.grade - 1);
  if(profile.grade < 9) grades.push(profile.grade + 1);

  const attempts = await prisma.examAttempt.findMany({ where: { studentId: profile.id, grade: { in: grades } } });
  const byGrade = Object.fromEntries(attempts.map(a => [a.grade, a]));

  const exams = grades.map(gr => {
    const cfg = GRADE_CONFIG[gr];
    const attempt = byGrade[gr];
    return {
      id: `ex_${gr}`,
      title: `Ujian ${cfg.name}`,
      desc: cfg.desc,
      grade: gr,
      duration: getExamDuration(gr),
      questions: 10,
      completed: !!attempt?.completed,
      score: attempt?.score || 0
    };
  });

  res.json({ exams });
});

module.exports = router;
