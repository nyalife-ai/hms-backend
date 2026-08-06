/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared',
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['**/src/shared/**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/src/shared/tsconfig.jest.json',
      },
    ],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/shared/**/*.ts',
    '!src/shared/**/__tests__/**',
    '!src/shared/**/*.spec.ts',
    '!src/shared/**/*.interface.ts',
    '!src/shared/**/*.types.ts',
    '!src/shared/**/index.ts',
  ],
  coverageDirectory: 'coverage/shared',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
};
