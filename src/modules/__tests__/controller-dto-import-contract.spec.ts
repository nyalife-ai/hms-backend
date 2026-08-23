/**
 * Regression: Nest ValidationPipe needs runtime DTO classes.
 * `import type { XDto }` erases them → forbidNonWhitelisted rejects page/limit.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('controller DTO imports must be value imports', () => {
  const modulesRoot = path.join(__dirname, '..', '..');

  function listControllers(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listControllers(full));
      else if (entry.name.endsWith('.controller.ts')) out.push(full);
    }
    return out;
  }

  it('no controller uses import type for *Dto classes', () => {
    const offenders: string[] = [];
    const re =
      /import\s+type\s+\{[^}]*\b\w+Dto\b[^}]*\}\s+from\s+['"][^'"]+['"]/gs;
    for (const file of listControllers(modulesRoot)) {
      const src = fs.readFileSync(file, 'utf8');
      if (re.test(src)) {
        offenders.push(path.relative(modulesRoot, file));
      }
      re.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });
});
