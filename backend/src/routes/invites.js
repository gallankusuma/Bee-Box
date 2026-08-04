const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const { authLimiter } = require('../middleware/rateLimit');
const { logAction } = require('../utils/auditLog');
const { createSession } = require('../utils/sessions');
const { setRefreshCookie } = require('../utils/refreshCookie');

const router = express.Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// URL tokens, not human-typed codes - long and random on purpose (contrast
// with utils/codes.js generateCode(), which is short by design for the
// join/link codes people type in by hand).
function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

const createInviteSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(120).optional()
});

const acceptInviteSchema = z.object({
  username: z.string().trim().min(3).max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  password: z.string().min(6).max(100)
}).refine(data => data.username || data.email, { message: 'username or email is required', path: ['username'] });

// POST /api/invites/teacher - an ADMIN invites a new teacher for their school.
router.post('/teacher', requireAuth, requireRole('ADMIN'), validateBody(createInviteSchema), async (req, res) => {
  const { name, email } = req.body;

  const invite = await prisma.teacherInvite.create({
    data: {
      name,
      email: email || null,
      token: generateInviteToken(),
      schoolId: req.auth.schoolId,
      invitedByUserId: req.auth.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS)
    }
  });

  await logAction({
    actorUserId: req.auth.userId, action: 'TEACHER_INVITE_CREATED', entityType: 'TeacherInvite',
    entityId: invite.id, schoolId: req.auth.schoolId, req
  });

  res.status(201).json({ token: invite.token, expiresAt: invite.expiresAt });
});

// GET /api/invites/teacher/:token - public, lets the accept-invite screen
// show who's accepting before asking for a username/password.
router.get('/teacher/:token', async (req, res) => {
  const invite = await prisma.teacherInvite.findUnique({
    where: { token: req.params.token },
    include: { school: true }
  });
  if(!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: 'Invite not found or expired' });
  }
  res.json({ name: invite.name, email: invite.email, schoolName: invite.school.name });
});

// POST /api/invites/teacher/:token/accept - public. Turns a pending invite
// into a real TEACHER account (name comes from the invite, not re-typed).
router.post('/teacher/:token/accept', authLimiter, validateBody(acceptInviteSchema), async (req, res) => {
  const { username, email, password } = req.body;

  const invite = await prisma.teacherInvite.findUnique({ where: { token: req.params.token } });
  if(!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: 'Invite not found or expired' });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [username ? { username } : undefined, email ? { email } : undefined].filter(Boolean) }
  });
  if(existing) return res.status(409).json({ error: 'username or email already taken' });

  const passwordHash = await bcrypt.hash(password, 10);

  const { user, roleAssignment } = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: invite.name } });
    const user = await tx.user.create({
      data: {
        personId: person.id,
        username: username || null,
        email: email || invite.email || null,
        passwordHash,
        name: invite.name,
        status: 'ACTIVE'
      }
    });
    const roleAssignment = await tx.roleAssignment.create({ data: { userId: user.id, role: 'TEACHER', schoolId: invite.schoolId } });
    await tx.teacherInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    return { user, roleAssignment };
  });

  await logAction({
    actorUserId: user.id, action: 'TEACHER_INVITE_ACCEPTED', entityType: 'TeacherInvite',
    entityId: invite.id, schoolId: invite.schoolId, req
  });

  const session = await createSession(user.id, req);
  const accessToken = signAccessToken(user, roleAssignment);
  const refreshToken = signRefreshToken(user, session.id);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({
    user: { id: user.id, name: user.name, avatar: user.avatar, role: roleAssignment.role, username: user.username, email: user.email },
    accessToken, refreshToken
  });
});

module.exports = router;
