// One-off bootstrap: creates the first ADMIN account for the default School.
// There's no admin yet to invite one (see routes/invites.js), so this is the
// only way an ADMIN RoleAssignment ever gets created - run manually by a
// developer/operator, never exposed over HTTP. Team_Review.md P0 item 2.
//
// Usage: node scripts/create-admin.js <username> <password> "<full name>"
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if(!username || !password || !name) {
    console.error('Usage: node scripts/create-admin.js <username> <password> "<full name>"');
    process.exit(1);
  }
  if(password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
  if(!school) throw new Error('No School row exists - run scripts/backfill-identity.js first');

  const existing = await prisma.user.findFirst({ where: { username } });
  if(existing) throw new Error(`Username "${username}" is already taken`);

  const passwordHash = await bcrypt.hash(password, 10);

  const { user } = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: name } });
    const user = await tx.user.create({
      data: { personId: person.id, username, passwordHash, name, status: 'ACTIVE' }
    });
    await tx.roleAssignment.create({ data: { userId: user.id, role: 'ADMIN', schoolId: school.id } });
    return { user };
  });

  console.log(`Created ADMIN account "${username}" (user id ${user.id}) for school ${school.name}.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
