module.exports = {
  preset: 'ts-jest',
  testTimeout: 60000, // Increased to 60s for integration tests
  testRegex: '__tests__/.*.test.ts$',
  moduleFileExtensions: ['js', 'json', 'jsx', 'node', 'ts', 'tsx'],
  testEnvironment: 'node',
  collectCoverage: false,
  coverageReporters: ['json', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
};
