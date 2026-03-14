const baseConfig = require('./jest.base.config');
const { integrationTestGlobs } = require('./jest.test-groups');

module.exports = {
  ...baseConfig,
  // Slow/live suites that are useful for periodic validation but not default runs.
  testMatch: integrationTestGlobs,
  testPathIgnorePatterns: [],
};
