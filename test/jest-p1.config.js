const base = require('./jest-isolated.base.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: [
    '<rootDir>/src/modules/**/__tests__/p1-*.spec.ts',
    '<rootDir>/test/p1/**/*.spec.ts',
  ],
};
