/** @type {import('jest').Config} */
module.exports = {
  displayName: 'infrastructure',
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['**/src/infrastructure/**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/src/infrastructure/tsconfig.jest.json',
      },
    ],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/infrastructure/**/*.ts',
    '!src/infrastructure/**/__tests__/**',
    '!src/infrastructure/**/*.spec.ts',
    '!src/infrastructure/**/*.interface.ts',
    '!src/infrastructure/**/*.types.ts',
    '!src/infrastructure/**/index.ts',
    '!src/infrastructure/**/*.options.ts',
  ],
  coverageDirectory: 'coverage/infrastructure',
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
