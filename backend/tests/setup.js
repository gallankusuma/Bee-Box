// Runs before each test file's module registry is set up, so `db.js`'s
// PrismaClient (and jwt.js's secrets) always see the test environment
// regardless of import order.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.ALLOWED_ORIGINS = 'http://localhost:8090';
