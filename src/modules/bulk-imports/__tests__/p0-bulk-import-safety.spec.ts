/**
 * P0 bulk import — Redis session store + commit blocked when invalidRows > 0.
 */

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BulkImportsService } from '../bulk-imports.service';
import { ImportSessionStore } from '../sessions/import-session.store';

function stubImporter(
  resourceKey: string,
  validateResult: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    errors: Array<{ row: number; field?: string; message: string }>;
    warnings: [];
    rows: Array<{ index: number; data: Record<string, unknown> }>;
    previewSample: [];
  },
) {
  return {
    resourceKey,
    displayName: resourceKey,
    headers: ['Name'] as const,
    requiredHeaders: ['Name'] as const,
    buildTemplateCsv: () => 'Name\n',
    buildExampleCsv: () => 'Name\nA\n',
    validate: jest.fn().mockResolvedValue(validateResult),
    commit: jest.fn().mockResolvedValue({
      imported: validateResult.validRows,
      failed: 0,
      skipped: 0,
      errors: [],
      createdIds: ['id-1'],
    }),
  };
}

describe('P0 ImportSessionStore (Redis)', () => {
  let store: ImportSessionStore;

  beforeAll(async () => {
    store = new ImportSessionStore({
      get: (key: string) => {
        if (key === 'redis.host') return process.env.REDIS_HOST || '127.0.0.1';
        if (key === 'redis.port')
          return Number(process.env.REDIS_PORT || 6379);
        if (key === 'redis.password') return process.env.REDIS_PASSWORD || '';
        return undefined;
      },
    } as unknown as ConfigService);
    await store.onModuleInit();
  });

  afterAll(async () => {
    await store.onModuleDestroy();
  });

  it('persists session in Redis and retrieves it', async () => {
    const session = await store.create({
      resourceKey: 'wards',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      warningRows: 0,
      errors: [],
      warnings: [],
      rows: [{ index: 0, data: { name: 'A' } }],
    });

    const loaded = await store.get(session.id);
    expect(loaded?.id).toBe(session.id);
    expect(loaded?.resourceKey).toBe('wards');
    expect(loaded?.validRows).toBe(2);
    expect(loaded!.expiresAt - loaded!.createdAt).toBeGreaterThanOrEqual(
      29 * 60_000,
    );

    await store.delete(session.id);
    expect(await store.get(session.id)).toBeUndefined();
  });

  it('falls back to memory when Redis is unreachable', async () => {
    const memStore = new ImportSessionStore({
      get: (key: string) => {
        if (key === 'redis.host') return '127.0.0.1';
        if (key === 'redis.port') return 6399; // nothing listening
        if (key === 'redis.password') return '';
        return undefined;
      },
    } as unknown as ConfigService);
    await memStore.onModuleInit();

    const session = await memStore.create({
      resourceKey: 'beds',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      warningRows: 0,
      errors: [],
      warnings: [],
      rows: [{ index: 0, data: { name: 'B1' } }],
    });
    expect(await memStore.get(session.id)).toBeDefined();
    await memStore.delete(session.id);
    await memStore.onModuleDestroy();
  });
});

describe('P0 BulkImportsService CSV edge cases', () => {
  function buildService(sessions: {
    create: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  }) {
    const empty = stubImporter('patients', {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warningRows: 0,
      errors: [],
      warnings: [],
      rows: [],
      previewSample: [],
    });
    return new BulkImportsService(
      sessions as never,
      empty as never,
      stubImporter('doctors', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('wards', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('beds', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('lab-test-types', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('services', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('medications', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('suppliers', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
    );
  }

  it('rejects empty CSV (header only)', async () => {
    const sessions = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const service = buildService(sessions);
    await expect(
      service.validate(
        'patients',
        { buffer: Buffer.from('Name\n', 'utf8'), originalname: 'empty.csv' },
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('rejects missing required columns', async () => {
    const sessions = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const patients = {
      ...stubImporter('patients', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }),
      headers: ['Name', 'Code'] as const,
      requiredHeaders: ['Name'] as const,
    };
    const service = new BulkImportsService(
      sessions as never,
      patients as never,
      stubImporter('doctors', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('wards', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('beds', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('lab-test-types', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('services', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('medications', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('suppliers', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
    );
    await expect(
      service.validate(
        'patients',
        {
          buffer: Buffer.from('Code\nx\n', 'utf8'),
          originalname: 'bad.csv',
        },
        'actor-1',
      ),
    ).rejects.toThrow(/Missing required column/i);
  });

  it('rejects unsupported / malformed columns', async () => {
    const sessions = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const service = buildService(sessions);
    await expect(
      service.validate(
        'patients',
        {
          buffer: Buffer.from('Name,HackerCol\nA,x\n', 'utf8'),
          originalname: 'extra.csv',
        },
        'actor-1',
      ),
    ).rejects.toThrow(/Unsupported column/i);
  });

  it('rejects non-csv uploads', async () => {
    const sessions = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const service = buildService(sessions);
    await expect(
      service.validate(
        'patients',
        { buffer: Buffer.from('Name\nA\n'), originalname: 'data.xlsx' },
        'actor-1',
      ),
    ).rejects.toThrow(/must be a CSV/i);
  });
});

describe('P0 BulkImportsService clinical safety (no partial commit)', () => {
  it('validate creates session with canCommit=false when invalidRows > 0', async () => {
    const sessions = {
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'sess-invalid',
        ...input,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60_000,
      })),
      get: jest.fn(),
      delete: jest.fn(),
    };

    const invalidImporter = stubImporter('wards', {
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
      warningRows: 0,
      errors: [{ row: 2, message: 'bad' }],
      warnings: [],
      rows: [{ index: 0, data: { name: 'ok' } }],
      previewSample: [],
    });

    const service = new BulkImportsService(
      sessions as never,
      stubImporter('patients', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('doctors', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      invalidImporter as never,
      stubImporter('beds', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('lab-test-types', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('services', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('medications', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('suppliers', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
    );

    const csv = Buffer.from('Name\nOk\nBad\n', 'utf8');
    const result = await service.validate(
      'wards',
      { buffer: csv, originalname: 'wards.csv' },
      'actor-1',
    );

    expect(result.invalidRows).toBe(1);
    expect(result.canCommit).toBe(false);
    expect(sessions.create).toHaveBeenCalled();
  });

  it('commit throws BadRequestException when session has invalidRows', async () => {
    const sessions = {
      create: jest.fn(),
      get: jest.fn().mockResolvedValue({
        id: 'sess-1',
        resourceKey: 'wards',
        actorUserId: 'actor-1',
        invalidRows: 2,
        rows: [{ index: 0, data: {} }],
      }),
      delete: jest.fn(),
    };

    const wards = stubImporter('wards', {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warningRows: 0,
      errors: [],
      warnings: [],
      rows: [],
      previewSample: [],
    });

    const service = new BulkImportsService(
      sessions as never,
      stubImporter('patients', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('doctors', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      wards as never,
      stubImporter('beds', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('lab-test-types', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('services', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('medications', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
      stubImporter('suppliers', {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        warningRows: 0,
        errors: [],
        warnings: [],
        rows: [],
        previewSample: [],
      }) as never,
    );

    await expect(
      service.commit('wards', 'sess-1', 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(wards.commit).not.toHaveBeenCalled();
    expect(sessions.delete).not.toHaveBeenCalled();
  });
});
