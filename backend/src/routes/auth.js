const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { isValidRole } = require('../utils/roles');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { generateCode } = require('../utils/codes');
const { getDefaultSchoolId } = require('../utils/school');
const { getActiveRoleAssignment } = require('../utils/roleAssignment');

async function uniqueLinkCode() {
  for(let i = 0; i < 5; i++) {
    const code = generateCode();
    const clash = await prisma.studentProfile.findUnique({ where: { linkCode: code } });
    if(!clash) return code;
  }
  throw new Error('Could not generate a unique link code, please retry');
}

const router = express.Router();

function publicUser(user, roleAssignment) {
  return { id: user.id, name: user.name, avatar: user.avatar, role: roleAssignment.role, username: user.username, email: user.email };
}

// POST /api/auth/register
// STUDENT registration also creates the StudentProfile (grade/birthdate),
// folding the old client-side onboarding wizard into one call.
router.post('/register', async (req, res) => {
  const { username, email, password, role, name, avatar, birthdate, grade } = req.body || {};

  if(!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if(!username && !email) return res.status(400).json({ error: 'username or email is required' });
  if(!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if(!isValidRole(role)) return res.status(400).json({ error: 'role must be STUDENT, PARENT, or TEACHER' });

  if(role === 'STUDENT') {
    const gradeNum = parseInt(grade, 10);
    if(!Number.isInteger(gradeNum) || gradeNum < 1 || gradeNum > 9) {
      return res.status(400).json({ error: 'grade (1-9) is required for STUDENT registration' });
    }
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [username ? { username } : undefined, email ? { email } : undefined].filter(Boolean) }
  });
  if(existing) return res.status(409).json({ error: 'username or email already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const linkCode = role === 'STUDENT' ? await uniqueLinkCode() : null;
  const schoolId = await getDefaultSchoolId();

  const { user, roleAssignment } = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: name.trim() } });

    const user = await tx.user.create({
      data: {
        personId: person.id,
        username: username || null,
        email: email || null,
        passwordHash,
        name: name.trim(),
        avatar: avatar || '🧒',
        ...(role === 'STUDENT' ? {
          studentProfile: {
            create: {
              birthdate: birthdate || null,
              grade: parseInt(grade, 10),
              unlockedGrades: JSON.stringify(Array.from({ length: parseInt(grade, 10) }, (_, i) => i + 1)),
              linkCode
            }
          }
        } : {})
      },
      include: { studentProfile: true }
    });

    const roleAssignment = await tx.roleAssignment.create({ data: { userId: user.id, role, schoolId } });

    return { user, roleAssignment };
  });

  const accessToken = signAccessToken(user, roleAssignment);
  const refreshToken = signRefreshToken(user);
  res.status(201).json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null, accessToken, refreshToken });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, email, password } = req.body || {};
  if(!password || (!username && !email)) return res.status(400).json({ error: 'username/email and password are required' });

  const user = await prisma.user.findFirst({
    where: username ? { username } : { email },
    include: { studentProfile: true }
  });
  if(!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const roleAssignment = await getActiveRoleAssignment(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signAccessToken(user, roleAssignment);
  const refreshToken = signRefreshToken(user);
  res.json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null, accessToken, refreshToken });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if(!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if(!user) return res.status(401).json({ error: 'User no longer exists' });

  const roleAssignment = await getActiveRoleAssignment(user.id);
  res.json({ accessToken: signAccessToken(user, roleAssignment), refreshToken: signRefreshToken(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, include: { studentProfile: true } });
  if(!user) return res.status(404).json({ error: 'User not found' });
  const roleAssignment = await getActiveRoleAssignment(user.id);
  res.json({ user: publicUser(user, roleAssignment), studentProfile: user.studentProfile || null });
});

module.exports = router;
