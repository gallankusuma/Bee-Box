const prisma = require('../db');

let cachedSchoolId = null;

// Single-tenant for now: every account gets assigned to whichever School row
// was created first. Memoized since it never changes at this scale.
async function getDefaultSchoolId() {
  if(cachedSchoolId) return cachedSchoolId;
  const school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
  if(!school) throw new Error('No School row exists - run backend/scripts/backfill-identity.js');
  cachedSchoolId = school.id;
  return cachedSchoolId;
}

module.exports = { getDefaultSchoolId };
