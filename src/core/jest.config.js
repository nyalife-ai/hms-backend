/** @type {import('jest').Config} */
module.exports = {
  displayName: 'core',
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['**/src/core/**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/src/core/tsconfig.jest.json',
      },
    ],
  },
  collectCoverageFrom: [
    'src/core/**/*.ts',
    '!src/core/**/__tests__/**',
    '!src/core/**/*.spec.ts',
    '!src/core/**/*.interface.ts',
    '!src/core/cqrs/command-bus.ts',
    '!src/core/cqrs/query-bus.ts',
    '!src/core/cqrs/event-bus.ts',
    '!src/core/cqrs/command-handler.ts',
    '!src/core/cqrs/query-handler.ts',
    '!src/core/events/event-handler.ts',
    '!src/core/events/core-event.ts',
  ],
  coverageDirectory: 'coverage/core',
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
