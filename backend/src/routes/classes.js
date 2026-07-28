const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateCode } = require('../utils/codes');
const { studentSummary } = require('../utils/studentSummary');
const { GRADE_CONFIG } = require('../../../shared/gradeConfig');

const router = express.Router();

async function uniqueJoinCode() {
  for(let i = 0; i < 5; i++) {
    const code = generateCode();
    const clash = await prisma.class.findUnique({ where: { joinCode: code } });
    if(!clash) return code;
  }
  throw new Error('Could not generate a unique join code, please retry');
}

// POST /api/classes - a teacher creates a class and gets a join code to share.
router.post('/', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const { name, grade } = req.body || {};
  const gradeNum = parseInt(grade, 10);
  if(!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if(!GRADE_CONFIG[gradeNum]) return res.status(400).json({ error: 'Invalid grade' });

  const joinCode = await uniqueJoinCode();
  const cls = await prisma.class.create({
    data: { teacherId: req.auth.userId, name: name.trim(), grade: gradeNum, joinCode }
  });
  res.status(201).json(cls);
});

// GET /api/classes - the calling teacher's own classes with roster counts.
router.get('/', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const classes = await prisma.class.findMany({
    where: { teacherId: req.auth.userId },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({
    classes: classes.map(c => ({
      id: c.id, name: c.name, grade: c.grade, joinCode: c.joinCode,
      createdAt: c.createdAt, studentCount: c._count.enrollments
    }))
  });
});

// GET /api/classes/:id - roster with per-student summary stats, teacher-owned only.
router.get('/:id', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const cls = await prisma.class.findUnique({
    where: { id: req.params.id },
    include: { enrollments: { include: { student: { include: { user: true } } } } }
  });
  if(!cls || cls.teacherId !== req.auth.userId) return res.status(404).json({ error: 'Class not found' });

  res.json({
    id: cls.id, name: cls.name, grade: cls.grade, joinCode: cls.joinCode,
    students: cls.enrollments.map(e => studentSummary(e.student))
  });
});

// GET /api/classes/:id/students/:studentId - full detail for one roster student.
router.get('/:id/students/:studentId', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const cls = await prisma.class.findUnique({ where: { id: req.params.id } });
  if(!cls || cls.teacherId !== req.auth.userId) return res.status(404).json({ error: 'Class not found' });

  const enrollment = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId: req.params.studentId } }
  });
  if(!enrollment) return res.status(404).json({ error: 'Student is not enrolled in this class' });

  const sp = await prisma.studentProfile.findUnique({
    where: { id: req.params.studentId },
    include: {
      user: true,
      achievements: true,
      sessions: { where: { status: 'finished' }, orderBy: { finishedAt: 'desc' }, take: 20 }
    }
  });
  if(!sp) return res.status(404).json({ error: 'Student not found' });

  res.json({
    ...studentSummary(sp),
    achievementsUnlocked: sp.achievements.length,
    history: sp.sessions.map(s => ({
      date: s.finishedAt, grade: s.grade, subLevel: s.subLevel, score: s.score,
      correct: s.correct, wrong: s.wrong, accuracy: s.accuracy, duration: s.duration, isExam: s.isExam
    }))
  });
});

// POST /api/classes/join - a student enrolls themself using a teacher's join code.
router.post('/join', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const { joinCode } = req.body || {};
  if(!joinCode) return res.status(400).json({ error: 'joinCode is required' });

  const cls = await prisma.class.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
  if(!cls) return res.status(404).json({ error: 'Class not found for that code' });

  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found' });

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId: profile.id } }
  });
  if(existing) return res.status(409).json({ error: 'Already enrolled in this class' });

  await prisma.classEnrollment.create({ data: { classId: cls.id, studentId: profile.id } });
  res.status(201).json({ ok: true, className: cls.name });
});

module.exports = router;
