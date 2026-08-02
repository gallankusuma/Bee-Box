const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireClassOwnership, requireStudentEnrollment } = require('../middleware/ownership');
const { validateBody } = require('../middleware/validate');
const { generateCode } = require('../utils/codes');
const { studentSummary } = require('../utils/studentSummary');
const { GRADE_CONFIG } = require('../../../shared/gradeConfig');
const { codeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const createClassSchema = z.object({
  name: z.string().trim().min(1).max(60),
  grade: z.coerce.number().int().refine(g => !!GRADE_CONFIG[g], { message: 'Invalid grade' })
});

const patchClassSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  grade: z.coerce.number().int().refine(g => !!GRADE_CONFIG[g], { message: 'Invalid grade' }).optional()
}).refine(data => data.name !== undefined || data.grade !== undefined, { message: 'Nothing to update', path: ['name'] });

const joinClassSchema = z.object({
  joinCode: z.string().trim().min(1).max(20)
});

async function uniqueJoinCode() {
  for(let i = 0; i < 5; i++) {
    const code = generateCode();
    const clash = await prisma.class.findUnique({ where: { joinCode: code } });
    if(!clash) return code;
  }
  throw new Error('Could not generate a unique join code, please retry');
}

// POST /api/classes - a teacher creates a class and gets a join code to share.
router.post('/', requireAuth, requireRole('TEACHER'), validateBody(createClassSchema), async (req, res) => {
  const { name, grade } = req.body;

  const joinCode = await uniqueJoinCode();
  const cls = await prisma.class.create({
    data: { teacherId: req.auth.userId, schoolId: req.auth.schoolId, name, grade, joinCode }
  });
  res.status(201).json(cls);
});

// GET /api/classes - the calling teacher's own classes with roster counts.
router.get('/', requireAuth, requireRole('TEACHER'), async (req, res) => {
  const classes = await prisma.class.findMany({
    where: { teacherId: req.auth.userId, schoolId: req.auth.schoolId },
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
router.get('/:id', requireAuth, requireRole('TEACHER'), requireClassOwnership(), async (req, res) => {
  const cls = await prisma.class.findUnique({
    where: { id: req.class.id },
    include: { enrollments: { include: { student: { include: { user: true } } } } }
  });

  res.json({
    id: cls.id, name: cls.name, grade: cls.grade, joinCode: cls.joinCode,
    students: cls.enrollments.map(e => studentSummary(e.student))
  });
});

// GET /api/classes/:id/students/:studentId - full detail for one roster student.
router.get('/:id/students/:studentId', requireAuth, requireRole('TEACHER'), requireClassOwnership(), requireStudentEnrollment(), async (req, res) => {
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

// PATCH /api/classes/:id - rename a class or move it to a different grade band.
router.patch('/:id', requireAuth, requireRole('TEACHER'), requireClassOwnership(), validateBody(patchClassSchema), async (req, res) => {
  const { name, grade } = req.body;
  const data = {};
  if(name !== undefined) data.name = name;
  if(grade !== undefined) data.grade = grade;

  const updated = await prisma.class.update({ where: { id: req.class.id }, data });
  res.json(updated);
});

// DELETE /api/classes/:id - removes the class and every enrollment in it
// (students and their game data are untouched, only the roster link is gone).
router.delete('/:id', requireAuth, requireRole('TEACHER'), requireClassOwnership(), async (req, res) => {
  await prisma.classEnrollment.deleteMany({ where: { classId: req.class.id } });
  await prisma.class.delete({ where: { id: req.class.id } });
  res.json({ ok: true });
});

// DELETE /api/classes/:id/students/:studentId - removes one student from the
// roster only; the student's account and game history are untouched.
router.delete('/:id/students/:studentId', requireAuth, requireRole('TEACHER'), requireClassOwnership(), requireStudentEnrollment(), async (req, res) => {
  await prisma.classEnrollment.delete({ where: { id: req.enrollment.id } });
  res.json({ ok: true });
});

// POST /api/classes/join - a student enrolls themself using a teacher's join code.
router.post('/join', requireAuth, requireRole('STUDENT'), codeLimiter, validateBody(joinClassSchema), async (req, res) => {
  const { joinCode } = req.body;

  const cls = await prisma.class.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
  // Same 404 whether the code is unknown or belongs to another school - don't
  // leak that a code exists outside the student's own tenant.
  if(!cls || cls.schoolId !== req.auth.schoolId) return res.status(404).json({ error: 'Class not found for that code' });

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
