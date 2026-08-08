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

  // Re-checked on every request (not baked into the JWT) so a suspended
  // account or a revoked/expired RoleAssignment can't keep using an
  // already-issued access token until it naturally expires (15m). Looking
  // this up by the specific RoleAssignment id embedded at sign time (not
  // just re-deriving "the" active one) means a role that's been superseded
  // since the token was issued stops working immediately, not just at
  // login/refresh time. Team_Review.md P0 item 2 + Review.md
  // implementation-review item 6.
  const assignment = await prisma.roleAssignment.findUnique({ where: { id: payload.raid }, include: { user: true } });
  const now = new Date();
  const stillValid = assignment
    && assignment.userId === payload.sub
    && assignment.user.status === 'ACTIVE'
    && assignment.validFrom <= now
    && (!assignment.validUntil || assignment.validUntil > now);
  if(!stillValid) return res.status(401).json({ error: 'Session is no longer valid' });

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
