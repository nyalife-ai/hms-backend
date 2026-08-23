const base = require('./jest-isolated.base.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: [
    '<rootDir>/src/modules/**/__tests__/p0-*.spec.ts',
    '<rootDir>/test/p0/**/*.spec.ts',
  ],
};
