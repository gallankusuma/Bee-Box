const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../db');
const { PUBLIC_ROLES } = require('../utils/roles');
const { signAccessToken, signRefreshToken, verifyRefreshToken, decodeExpiredRefreshToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { linkCodeExpiry, uniqueLinkCode } = require('../utils/codes');
const { getDefaultSchoolId } = require('../utils/school');
const { getActiveRoleAssignment } = require('../utils/roleAssignment');
const { authLimiter } = require('../middleware/rateLimit');
const { createSession } = require('../utils/sessions');
const { setRefreshCookie, clearRefreshCookie, readRefreshToken } = require('../utils/refreshCookie');
const { logAction } = require('../utils/auditLog');

const registerSchema = z.object({
  username: z.string().trim().min(3).max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  password: z.string().min(6).max(100),
  // TEACHER/ADMIN are never self-service - see routes/invites.js and
  // scripts/create-admin.js. Team_Review.md P0 item 2.
  role: z.enum(PUBLIC_ROLES),
  name: z.string().trim().min(1).max(60),
  avatar: z.string().max(10).optional(),
  birthdate: z.string().max(20).optional(),
  grade: z.coerce.number().int().min(1).max(9).optional()
}).refine(data => data.username || data.email, { message: 'username or email is required', path: ['username'] })
  .refine(data => data.role !== 'STUDENT' || data.grade !== undefined, { message: 'grade (1-9) is required for STUDENT registration', path: ['grade'] });

const loginSchema = z.object({
  username: z.string().trim().min(1).max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  password: z.string().min(1).max(100)
}).refine(data => data.username || data.email, { message: 'username/email and password are required', path: ['username'] });

// refreshToken is optional in the body because teacher-web sends it via the
// httpOnly cookie instead (see utils/refreshCookie.js); mobile-app still
// sends it in the body since cookies aren't viable for the native WebView.
const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

const router = express.Router();

function publicUser(user, roleAssignment) {
  return { id: user.id, name: user.name, avatar: user.avatar, role: roleAssignment.role, username: user.username, email: user.email };
}

// POST /api/auth/register
// STUDENT registration also creates the StudentProfile (grade/birthdate),
// folding the old client-side onboarding wizard into one call.
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { username, email, password, role, name, avatar, birthdate, grade } = req.body;

  const existing = await prisma.user.findFirst({
    where: { OR: [username ? { username } : undefined, email ? { email } : undefined].filter(Boolean) }
  });
  if(existing) return res.status(409).json({ error: 'username or email already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const linkCode = role === 'STUDENT' ? await uniqueLinkCode() : null;
  const schoolId = await getDefaultSchoolId();

  const { user, roleAssignment } = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: name } });

    const user = await tx.user.create({
      data: {
        personId: person.id,
        username: username || null,
        email: email || null,
        passwordHash,
        name,
        avatar: avatar || '🧒',
        ...(role === 'STUDENT' ? {
          studentProfile: {
            create: {
              birthdate: birthdate || null,
              grade,
              unlockedGrades: JSON.stringify(Array.from({ length: grade }, (_, i) => i + 1)),
              linkCode,
              linkCodeExpiresAt: linkCodeExpiry()
            }
          }
        } : {})
      },
      include: { studentProfile: true }
    });

    const roleAssignment = await tx.roleAssignment.create({ data: { userId: user.id, role, schoolId } });

    return { user, roleAssignment };
  });

  const session = await createSession(user.id, req);
  const accessToken = signAccessToken(user, roleAssignment);
  const refreshToken = signRefreshToken(user, session.id);
  setRefreshCookie(res, refreshToken);

  await logAction({
    actorUserId: user.id, action: 'USER_REGISTERED', entityType: 'User',
    entityId: user.id, schoolId, metadata: { role }, req
  });

  res.status(201).json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null, accessToken, refreshToken });
});

// POST /api/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { username, email, password } = req.body;

  const user = await prisma.user.findFirst({
    where: username ? { username } : { email },
    include: { studentProfile: true }
  });
  if(!user) {
    await logAction({ action: 'LOGIN_FAILED', entityType: 'User', metadata: { username: username || email }, req });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok) {
    await logAction({ actorUserId: user.id, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, req });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const roleAssignment = await getActiveRoleAssignment(user.id);
  if(!roleAssignment) return res.status(401).json({ error: 'No active role assignment' });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const session = await createSession(user.id, req);
  const accessToken = signAccessToken(user, roleAssignment);
  const refreshToken = signRefreshToken(user, session.id);
  setRefreshCookie(res, refreshToken);

  await logAction({
    actorUserId: user.id, action: 'LOGIN_SUCCEEDED', entityType: 'User',
    entityId: user.id, schoolId: roleAssignment.schoolId, req
  });

  res.json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null, accessToken, refreshToken });
});

// POST /api/auth/refresh - rotates the refresh token on every call: the old
// session is revoked and a new one issued, so a stolen-then-reused refresh
// token stops working the moment the legitimate client refreshes first.
router.post('/refresh', authLimiter, validateBody(refreshSchema), async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if(!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const session = await prisma.session.findUnique({ where: { id: payload.jti } });
  if(!session || session.revokedAt || session.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Session revoked or expired' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if(!user) return res.status(401).json({ error: 'User no longer exists' });

  const roleAssignment = await getActiveRoleAssignment(user.id);
  if(!roleAssignment) return res.status(401).json({ error: 'No active role assignment' });

  const newSession = await prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    return createSession(user.id, req, tx);
  });

  const newRefreshToken = signRefreshToken(user, newSession.id);
  setRefreshCookie(res, newRefreshToken);
  res.json({ accessToken: signAccessToken(user, roleAssignment), refreshToken: newRefreshToken });
});

// POST /api/auth/logout - revokes one session (the caller's). Accepts an
// already-expired refresh token so logout is idempotent even after 30 days.
router.post('/logout', async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if(refreshToken) {
    try {
      const payload = decodeExpiredRefreshToken(refreshToken);
      await prisma.session.updateMany({ where: { id: payload.jti, revokedAt: null }, data: { revokedAt: new Date() } });
    } catch(e) {
      // Invalid signature - nothing to revoke, still clear the cookie below.
    }
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// POST /api/auth/logout-all - revokes every session for the caller (all devices).
router.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.session.updateMany({ where: { userId: req.auth.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/sessions - "daftar perangkat aktif" (active device list).
router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true }
  });
  res.json({ sessions });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, include: { studentProfile: true } });
  if(!user) return res.status(404).json({ error: 'User not found' });
  const roleAssignment = await getActiveRoleAssignment(user.id);
  if(!roleAssignment) return res.status(401).json({ error: 'No active role assignment' });
  res.json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null });
});

module.exports = router;
