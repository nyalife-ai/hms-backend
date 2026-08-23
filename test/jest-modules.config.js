/** @type {import('jest').Config} */
module.exports = {
  displayName: 'modules',
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/modules/**/__tests__/**/*.spec.ts',
    '<rootDir>/src/modules/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/test/setup/load-env-test.cjs'],
  globalSetup: '<rootDir>/test/setup/global-setup.cjs',
  collectCoverageFrom: [
    'src/modules/**/*.{ts,js}',
    '!src/modules/**/__tests__/**',
    '!src/modules/**/*.spec.ts',
    '!src/modules/**/*.interface.ts',
    '!src/modules/**/*.types.ts',
    '!src/modules/**/index.ts',
    '!src/modules/**/*.module.ts',
    '!src/modules/**/*.dto.ts',
    '!src/modules/**/dto/**',
    '!src/modules/module.sh',
  ],
  coverageDirectory: 'coverage/modules',
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
  maxWorkers: 1,
  testTimeout: 60000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  forceExit: true,
  detectOpenHandles: false,
};
