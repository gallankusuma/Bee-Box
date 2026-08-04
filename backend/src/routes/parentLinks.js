const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { studentSummary } = require('../utils/studentSummary');
const { codeLimiter } = require('../middleware/rateLimit');
const { linkCodeExpiry, uniqueLinkCode } = require('../utils/codes');
const { logAction } = require('../utils/auditLog');

const router = express.Router();

const claimSchema = z.object({
  linkCode: z.string().trim().min(1).max(20)
});

// POST /api/parent-links/claim - a parent links their account to a student
// using the linkCode shown in that student's app (Profile screen).
//
// Deliberately NOT scoped by school (unlike class-join, see routes/classes.js):
// GuardianStudentRelationship has no schoolId column at all - families can
// legitimately span schools (siblings at different campuses), and claiming
// requires the student's own secret linkCode (already rate-limited via
// codeLimiter), which their legitimate parent already has. That's not a
// directory-enumeration surface across a tenant boundary the way guessing a
// class join code is. See BEE_BOX_ROADMAP.md Phase 4 "Tenant isolation".
//
// The relationship starts PENDING - the student has to approve it (below)
// before the parent gets any visibility. The code itself is single-use: a
// successful claim immediately regenerates the student's code so it can't
// be claimed again by someone else. See Team_Review.md P0 item 3.
router.post('/claim', requireAuth, requireRole('PARENT'), codeLimiter, validateBody(claimSchema), async (req, res) => {
  const { linkCode } = req.body;

  const student = await prisma.studentProfile.findUnique({ where: { linkCode: linkCode.toUpperCase() }, include: { user: true } });
  if(!student) return res.status(404).json({ error: 'No student found for that code' });
  if(student.linkCodeExpiresAt && student.linkCodeExpiresAt < new Date()) {
    return res.status(410).json({ error: 'This code has expired - ask the student for a new one' });
  }

  const existing = await prisma.guardianStudentRelationship.findUnique({
    where: { parentId_studentId: { parentId: req.auth.userId, studentId: student.id } }
  });
  if(existing) return res.status(409).json({ error: 'Already linked to this student' });

  const relationship = await prisma.$transaction(async (tx) => {
    const relationship = await tx.guardianStudentRelationship.create({
      data: { parentId: req.auth.userId, studentId: student.id }
    });
    const newCode = await uniqueLinkCode();
    await tx.studentProfile.update({
      where: { id: student.id },
      data: { linkCode: newCode, linkCodeExpiresAt: linkCodeExpiry() }
    });
    return relationship;
  });

  await logAction({
    actorUserId: req.auth.userId, action: 'PARENT_LINK_CLAIMED', entityType: 'GuardianStudentRelationship',
    entityId: relationship.id, req
  });

  res.status(201).json({ ok: true, studentName: student.user.name, status: 'PENDING' });
});

// GET /api/parent-links/pending - a student's incoming, unapproved parent claims.
router.get('/pending', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found for this account' });

  const links = await prisma.guardianStudentRelationship.findMany({
    where: { studentId: profile.id, verificationStatus: 'PENDING' },
    include: { parent: true },
    orderBy: { linkedAt: 'desc' }
  });
  res.json({
    pending: links.map(l => ({ id: l.id, parentName: l.parent.name, parentAvatar: l.parent.avatar, linkedAt: l.linkedAt }))
  });
});

// POST /api/parent-links/:relationshipId/approve - student confirms a parent claim.
router.post('/:relationshipId/approve', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found for this account' });

  const link = await prisma.guardianStudentRelationship.findUnique({ where: { id: req.params.relationshipId } });
  if(!link || link.studentId !== profile.id) return res.status(404).json({ error: 'Request not found' });
  if(link.verificationStatus !== 'PENDING') return res.status(409).json({ error: 'Request already resolved' });

  await prisma.guardianStudentRelationship.update({
    where: { id: link.id },
    data: { verificationStatus: 'VERIFIED', respondedAt: new Date() }
  });
  await logAction({
    actorUserId: req.auth.userId, action: 'PARENT_LINK_APPROVED', entityType: 'GuardianStudentRelationship',
    entityId: link.id, req
  });
  res.json({ ok: true });
});

// POST /api/parent-links/:relationshipId/reject - student declines a parent claim.
router.post('/:relationshipId/reject', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found for this account' });

  const link = await prisma.guardianStudentRelationship.findUnique({ where: { id: req.params.relationshipId } });
  if(!link || link.studentId !== profile.id) return res.status(404).json({ error: 'Request not found' });
  if(link.verificationStatus !== 'PENDING') return res.status(409).json({ error: 'Request already resolved' });

  await prisma.guardianStudentRelationship.delete({ where: { id: link.id } });
  await logAction({
    actorUserId: req.auth.userId, action: 'PARENT_LINK_REJECTED', entityType: 'GuardianStudentRelationship',
    entityId: link.id, req
  });
  res.json({ ok: true });
});

// DELETE /api/parent-links/:relationshipId - unlink an existing relationship.
// Either side (the parent or the student) can end it.
router.delete('/:relationshipId', requireAuth, requireRole('PARENT', 'STUDENT'), async (req, res) => {
  const link = await prisma.guardianStudentRelationship.findUnique({
    where: { id: req.params.relationshipId },
    include: { student: true }
  });
  if(!link) return res.status(404).json({ error: 'Relationship not found' });

  const owns = req.auth.role === 'PARENT'
    ? link.parentId === req.auth.userId
    : link.student.userId === req.auth.userId;
  if(!owns) return res.status(404).json({ error: 'Relationship not found' });

  await prisma.guardianStudentRelationship.delete({ where: { id: link.id } });
  await logAction({
    actorUserId: req.auth.userId, action: 'PARENT_LINK_UNLINKED', entityType: 'GuardianStudentRelationship',
    entityId: link.id, req
  });
  res.json({ ok: true });
});

// POST /api/parent-links/regenerate-code - a student invalidates their
// current linkCode early (e.g. shared it by mistake) and gets a fresh one.
router.post('/regenerate-code', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.userId } });
  if(!profile) return res.status(404).json({ error: 'Student profile not found for this account' });

  const newCode = await uniqueLinkCode();
  const expiresAt = linkCodeExpiry();
  await prisma.studentProfile.update({ where: { id: profile.id }, data: { linkCode: newCode, linkCodeExpiresAt: expiresAt } });
  res.json({ linkCode: newCode, linkCodeExpiresAt: expiresAt });
});

// GET /api/parent-links/children - read-only summaries of every VERIFIED linked student.
router.get('/children', requireAuth, requireRole('PARENT'), async (req, res) => {
  const links = await prisma.guardianStudentRelationship.findMany({
    where: { parentId: req.auth.userId, verificationStatus: 'VERIFIED' },
    include: { student: { include: { user: true } } }
  });
  res.json({ children: links.map(l => ({ ...studentSummary(l.student), relationshipId: l.id })) });
});

// GET /api/parent-links/children/:studentId - full read-only detail for one linked child.
router.get('/children/:studentId', requireAuth, requireRole('PARENT'), async (req, res) => {
  const link = await prisma.guardianStudentRelationship.findUnique({
    where: { parentId_studentId: { parentId: req.auth.userId, studentId: req.params.studentId } }
  });
  if(!link || link.verificationStatus !== 'VERIFIED') return res.status(404).json({ error: 'Not linked to this student' });

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
