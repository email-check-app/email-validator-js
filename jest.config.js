const baseConfig = require('./jest.base.config');
const { integrationIgnorePatterns } = require('./jest.test-groups');

module.exports = {
  ...baseConfig,
  // Fast deterministic suite for local/dev workflows.
  testPathIgnorePatterns: integrationIgnorePatterns,
};
