/**
 * Ensures the public barrel exports resolve and that core has no Nest/ORM imports.
 */
import * as Core from '../index';

describe('core barrel exports', () => {
  it('exports domain building blocks', () => {
    expect(Core.Entity).toBeDefined();
    expect(Core.AggregateRoot).toBeDefined();
    expect(Core.ValueObject).toBeDefined();
    expect(Core.DomainEvent).toBeDefined();
    expect(typeof Core.createDomainEventId).toBe('function');
  });

  it('exports CQRS contracts', () => {
    expect(Core.BaseCommand).toBeDefined();
    expect(Core.BaseQuery).toBeDefined();
    expect(typeof Core.createCommandId).toBe('function');
    expect(typeof Core.createQueryId).toBe('function');
  });

  it('exports event contracts', () => {
    expect(Core.IntegrationEvent).toBeDefined();
    expect(Core.ApplicationEvent).toBeDefined();
    expect(typeof Core.createIntegrationEventId).toBe('function');
    expect(typeof Core.createApplicationEventId).toBe('function');
    expect(Core.createIntegrationEventId().length).toBeGreaterThan(0);
    expect(Core.createApplicationEventId().length).toBeGreaterThan(0);
  });

  it('exports exceptions', () => {
    expect(Core.DomainException).toBeDefined();
    expect(Core.ValidationException).toBeDefined();
    expect(Core.NotFoundException).toBeDefined();
    expect(Core.ConflictException).toBeDefined();
    expect(Core.BusinessRuleException).toBeDefined();
  });

  it('exports contracts', () => {
    expect(Core.Result).toBeDefined();
    expect(Core.Specification).toBeDefined();
    expect(Core.AndSpecification).toBeDefined();
    expect(Core.OrSpecification).toBeDefined();
    expect(Core.NotSpecification).toBeDefined();
  });

  it('exports identity helpers', () => {
    expect(typeof Core.generateId).toBe('function');
  });
});

describe('core dependency isolation', () => {
  it('does not import NestJS or ORM packages', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    async function collectTsFiles(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') {
            continue;
          }
          files.push(...(await collectTsFiles(full)));
        } else if (
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts')
        ) {
          files.push(full);
        }
      }
      return files;
    }

    const root = path.join(__dirname, '..');
    const files = await collectTsFiles(root);
    const importPattern =
      /(?:from|require\()\s*['"](@nestjs\/|typeorm|@prisma\/client|prisma|ioredis|bullmq|kafkajs|@aws-sdk\/|express|fastify)/;

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      expect(content).not.toMatch(importPattern);
    }
  });
});
