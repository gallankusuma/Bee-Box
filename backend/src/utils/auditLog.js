const prisma = require('../db');

// Minimal audit trail - see the AuditLog model comment in schema.prisma for
// scope. `req` is optional (some call sites, like scripts, have no request).
async function logAction({ actorUserId = null, action, entityType, entityId = null, schoolId = null, metadata = null, req = null }) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      schoolId,
      ipAddress: req ? req.ip : null,
      userAgent: req ? (req.headers['user-agent'] || null) : null,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

module.exports = { logAction };
