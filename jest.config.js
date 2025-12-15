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
  // Add project-specific timeout configurations
  projects: [
    {
      displayName: 'unit-tests',
      testMatch: ['**/__tests__/*!(integration|smtp|socket)*.test.ts'],
      testTimeout: 15000, // 15s for unit tests
      preset: 'ts-jest',
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: 'tsconfig.test.json'
        }]
      }
    },
    {
      displayName: 'integration-tests',
      testMatch: ['**/__tests__/*(integration|smtp|socket)*.test.ts'],
      testTimeout: 120000, // 2 minutes for integration tests
      preset: 'ts-jest',
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: 'tsconfig.test.json'
        }]
      }
    }
  ]
};
