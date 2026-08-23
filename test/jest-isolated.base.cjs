/**
 * Shared Jest options for isolated P0/P1 regression suites.
 * Always loads .env.test (never application .env).
 */

/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/load-env-test.cjs'],
  globalSetup: '<rootDir>/test/setup/global-setup.cjs',
  maxWorkers: 1,
  testTimeout: 60000,
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  // Avoid haste-map collisions with compiled prisma client under dist/
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
