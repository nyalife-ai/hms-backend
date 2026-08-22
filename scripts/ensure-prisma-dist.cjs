/**
 * Ensure Prisma client is present under dist/ for `node dist/main`.
 * nest build copies via nest-cli assets; plain `tsc` does not.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainJs = path.join(root, 'dist', 'main.js');
const srcPrisma = path.join(root, 'src', 'generated', 'prisma');
const distPrisma = path.join(root, 'dist', 'generated', 'prisma');

if (!fs.existsSync(mainJs)) {
  console.error(
    '[ensure-prisma-dist] dist/main.js not found. Build the app first:\n  yarn build:app',
  );
  process.exit(1);
}

if (!fs.existsSync(srcPrisma)) {
  console.error(
    '[ensure-prisma-dist] src/generated/prisma missing. Run:\n  yarn prisma:generate',
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(distPrisma), { recursive: true });
fs.cpSync(srcPrisma, distPrisma, { recursive: true });
console.log('[ensure-prisma-dist] Copied Prisma client → dist/generated/prisma');
