#!/usr/bin/env node
/**
 * brace-expansion@5 exports `{ expand }` while older minimatch (used by ESLint)
 * expects `require('brace-expansion')` to be the expand function itself.
 * Keep the CVE-fixed 5.x package and restore callable CJS default export.
 */
const fs = require('node:fs');
const path = require('node:path');

const marker = '/* minimatch-cjs-compat */';
const targets = [
  path.join(
    __dirname,
    '..',
    'node_modules',
    'brace-expansion',
    'dist',
    'commonjs',
    'index.js',
  ),
];

const snippet = `
${marker}
if (typeof module !== 'undefined' && module.exports && typeof expand === 'function') {
  module.exports = Object.assign(expand, {
    expand,
    EXPANSION_MAX: exports.EXPANSION_MAX,
    EXPANSION_MAX_LENGTH: exports.EXPANSION_MAX_LENGTH,
  });
}
`;

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue;
  }
  const current = fs.readFileSync(target, 'utf8');
  if (current.includes(marker)) {
    continue;
  }
  fs.writeFileSync(target, `${current.trimEnd()}\n${snippet}`);
}
