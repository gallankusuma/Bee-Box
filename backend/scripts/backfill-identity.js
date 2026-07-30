// One-off backfill for the identity foundation migration (see BEE_BOX_ROADMAP.md
// Phase 1). Run once, after the "expand" migration and before the "contract"
// migration: creates the default School, a Person per existing User, and one
// RoleAssignment per existing User (copied from the soon-to-be-dropped
// User.role column). Safe to re-run - every step is idempotent.
const prisma = require('../src/db');

async function main() {
  let school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
  if(!school) {
    school = await prisma.school.create({ data: { name: 'MathQuest', code: 'DEFAULT' } });
    console.log('Created default School:', school.id);
  } else {
    console.log('Using existing default School:', school.id);
  }

  const users = await prisma.user.findMany({ where: { personId: null } });
  console.log(`Backfilling Person + RoleAssignment for ${users.length} user(s) without a personId...`);

  for(const user of users) {
    const person = await prisma.person.create({ data: { fullName: user.name } });
    await prisma.user.update({ where: { id: user.id }, data: { personId: person.id } });

    const existingAssignment = await prisma.roleAssignment.findFirst({ where: { userId: user.id } });
    if(!existingAssignment) {
      await prisma.roleAssignment.create({
        data: { userId: user.id, role: user.role, schoolId: school.id }
      });
    }
  }

  const classesUpdated = await prisma.class.updateMany({
    where: { schoolId: null },
    data: { schoolId: school.id }
  });
  console.log(`Set schoolId on ${classesUpdated.count} class(es).`);

  const userCount = await prisma.user.count();
  const personCount = await prisma.person.count();
  const roleAssignmentCount = await prisma.roleAssignment.count();
  const classesWithoutSchool = await prisma.class.count({ where: { schoolId: null } });
  console.log({ userCount, personCount, roleAssignmentCount, classesWithoutSchool });

  if(userCount !== personCount || userCount !== roleAssignmentCount || classesWithoutSchool !== 0) {
    throw new Error('Backfill verification failed - counts do not line up, see above.');
  }
  console.log('Backfill complete and verified.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
