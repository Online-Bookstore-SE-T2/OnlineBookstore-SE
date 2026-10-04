module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/scripts/**'],
  // SRS 6.4 (NFR07): at least 60 percent of business-logic statements covered by tests
  coverageThreshold: { global: { statements: 60 } },
  testTimeout: 30000,
};
