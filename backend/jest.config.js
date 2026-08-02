module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  // SQLite doesn't handle concurrent writers well - run test files serially
  // against the one shared test.db rather than fighting file locks.
  maxWorkers: 1,
  testTimeout: 15000
};
