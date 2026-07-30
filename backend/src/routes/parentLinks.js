const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { studentSummary } = require('../utils/studentSummary');

const router = express.Router();

// POST /api/parent-links/claim - a parent links their account to a student
// using the linkCode shown in that student's app (Profile screen).
router.post('/claim', requireAuth, requireRole('PARENT'), async (req, res) => {
  const { linkCode } = req.body || {};
  if(!linkCode) return res.status(400).json({ error: 'linkCode is required' });

  const student = await prisma.studentProfile.findUnique({ where: { linkCode: linkCode.toUpperCase() }, include: { user: true } });
  if(!student) return res.status(404).json({ error: 'No student found for that code' });

  const existing = await prisma.guardianStudentRelationship.findUnique({
    where: { parentId_studentId: { parentId: req.auth.userId, studentId: student.id } }
  });
  if(existing) return res.status(409).json({ error: 'Already linked to this student' });

  await prisma.guardianStudentRelationship.create({ data: { parentId: req.auth.userId, studentId: student.id } });
  res.status(201).json({ ok: true, studentName: student.user.name });
});

// GET /api/parent-links/children - read-only summaries of every linked student.
router.get('/children', requireAuth, requireRole('PARENT'), async (req, res) => {
  const links = await prisma.guardianStudentRelationship.findMany({
    where: { parentId: req.auth.userId },
    include: { student: { include: { user: true } } }
  });
  res.json({ children: links.map(l => studentSummary(l.student)) });
});

// GET /api/parent-links/children/:studentId - full read-only detail for one linked child.
router.get('/children/:studentId', requireAuth, requireRole('PARENT'), async (req, res) => {
  const link = await prisma.guardianStudentRelationship.findUnique({
    where: { parentId_studentId: { parentId: req.auth.userId, studentId: req.params.studentId } }
  });
  if(!link) return res.status(404).json({ error: 'Not linked to this student' });

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

module.exports = router;
