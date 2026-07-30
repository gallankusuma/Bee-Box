const { verifyAccessToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role, schoolId: payload.schoolId, roleAssignmentId: payload.raid };
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if(!req.auth) return res.status(401).json({ error: 'Missing bearer token' });
    if(!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden for this role' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
