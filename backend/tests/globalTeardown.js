const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  const journalPath = `${dbPath}-journal`;
  [dbPath, journalPath].forEach(p => { if(fs.existsSync(p)) fs.unlinkSync(p); });
};
