const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Missing bearer token' });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Re-checked on every request (not baked into the JWT) so a suspended/
  // rejected account can't keep using an already-issued access token until
  // it naturally expires. Team_Review.md P0 item 2.
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
  if(!user || user.status !== 'ACTIVE') return res.status(401).json({ error: 'Account is not active' });

  req.auth = { userId: payload.sub, role: payload.role, schoolId: payload.schoolId, roleAssignmentId: payload.raid };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if(!req.auth) return res.status(401).json({ error: 'Missing bearer token' });
    if(!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden for this role' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
