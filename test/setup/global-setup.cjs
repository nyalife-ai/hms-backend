/**
 * Global Jest setup for P0 module integration tests (Postgres :5433).
 */

module.exports = async function globalSetup() {
  require('./load-env-test.cjs');
  const { execSync } = require('child_process');
  const path = require('path');
  const root = path.join(__dirname, '../..');

  execSync('npx prisma migrate deploy', {
    cwd: root,
    env: { ...process.env },
    stdio: 'inherit',
  });
};
