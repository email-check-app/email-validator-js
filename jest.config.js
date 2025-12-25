module.exports = {
  preset: 'ts-jest',
  testTimeout: 20000,
  testRegex: '__tests__/.*.test.ts$',
  testEnvironment: 'node',
  collectCoverage: false,
  coverageReporters: ['json', 'html'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
};
