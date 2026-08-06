/** @type {import('jest').Config} */
module.exports = {
  displayName: 'platform',
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['**/src/platform/**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/src/platform/tsconfig.jest.json',
      },
    ],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/platform/**/*.ts',
    '!src/platform/**/__tests__/**',
    '!src/platform/**/*.spec.ts',
    '!src/platform/**/*.interface.ts',
    '!src/platform/**/*.types.ts',
    '!src/platform/**/index.ts',
    '!src/platform/index.ts',
    // Nest WebSocket decorators inject constructor metadata branches that are not
    // reachable from unit tests without a live Socket.IO adapter.
    '!src/platform/realtime/gateways/nest-socketio.gateway.ts',
  ],
  coverageDirectory: 'coverage/platform',
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
