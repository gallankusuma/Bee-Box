const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const TEST_DATABASE_URL = 'file:./test.db';
const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');

// Runs once before the whole suite: fresh schema on a throwaway SQLite file,
// plus the one School row every registration flow depends on
// (mirrors backend/scripts/backfill-identity.js's seeding logic).
module.exports = async () => {
  if(fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const journalPath = `${dbPath}-journal`;
  if(fs.existsSync(journalPath)) fs.unlinkSync(journalPath);

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit'
  });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  await prisma.school.create({ data: { name: 'Test School', code: 'TEST' } });
  await prisma.$disconnect();
};
