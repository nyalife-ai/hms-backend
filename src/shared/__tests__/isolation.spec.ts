import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SHARED_ROOT = join(__dirname, '..');

const FORBIDDEN_SPECIFIERS =
  /(?:@nestjs(?:\/|$)|[/\\](?:platform|infrastructure)(?:[/\\]|$)|(?:^|\/)(?:platform|infrastructure)(?:\/|$))/;

const collectTsFiles = (directory: string): string[] => {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      files.push(...collectTsFiles(absolute));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(absolute);
    }
  }
  return files;
};

describe('shared isolation', () => {
  it('does not import @nestjs, platform, or infrastructure', () => {
    const files = collectTsFiles(SHARED_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g,
      )) {
        const specifier = match[1].replaceAll('\\', '/');
        if (
          specifier.startsWith('@nestjs') ||
          /(?:^|\/)(?:platform|infrastructure)(?:\/|$)/.test(specifier) ||
          FORBIDDEN_SPECIFIERS.test(specifier)
        ) {
          violations.push(`${file}: ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
