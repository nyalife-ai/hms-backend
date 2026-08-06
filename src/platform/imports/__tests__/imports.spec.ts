import { Readable } from 'node:stream';
import {
  ImportJobNotFoundError,
  InMemoryImportJobStore,
} from '../import-job.store';
import {
  countCsvRows,
  CsvFormatError,
  readCsvRows,
  readCsvRowsFromBuffer,
} from '../csv-row-reader';
import {
  requiredFieldsValidator,
  ValidationPipeline,
} from '../validation-pipeline';
import {
  columnDuplicateKeyExtractor,
  DuplicateDetector,
} from '../duplicate-detector';
import {
  ImportJobNotRegisteredError,
  ImportService,
  type ImportJobPayload,
} from '../import.service';
import {
  IMPORT_JOB_STORE,
  IMPORT_QUEUE_ADAPTER,
  IMPORT_STORAGE_PROVIDER,
} from '../import.tokens';
import type { ImportJob, ImportRow, RowValidator } from '../import.types';
import type { QueueAdapter } from '../../queue/contracts/queue-adapter.interface';
import type { StorageProvider } from '../../storage/storage-provider.interface';

describe('imports platform / import-job.store', () => {
  it('creates, retrieves, updates, and lists jobs', async () => {
    const store = new InMemoryImportJobStore();
    const job: ImportJob = {
      id: 'job-1',
      storageKey: 'imports/job-1/file.csv',
      status: 'pending',
      totalRows: 2,
      processedRows: 0,
      errorCount: 0,
      preview: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      errors: [],
    };
    await store.create(job);
    expect(await store.get('job-1')).toEqual(job);
    expect(await store.get('missing')).toBeUndefined();

    const updated = await store.update('job-1', { processedRows: 1 });
    expect(updated.processedRows).toBe(1);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      job.updatedAt.getTime(),
    );

    expect(await store.list()).toEqual([updated]);

    await expect(store.update('missing', { processedRows: 1 })).rejects.toThrow(
      ImportJobNotFoundError,
    );
  });
});

describe('imports platform / csv-row-reader', () => {
  it('parses quoted fields, escaped quotes, embedded delimiters, and skips blank lines', async () => {
    const csv = [
      'name,age,notes',
      '',
      'Alice,30,"Likes ""quotes"" and, commas"',
      'Bob,25,plain',
    ].join('\n');
    const rows: ImportRow[] = [];
    for await (const row of readCsvRows(Readable.from(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      {
        index: 0,
        values: {
          name: 'Alice',
          age: '30',
          notes: 'Likes "quotes" and, commas',
        },
      },
      { index: 1, values: { name: 'Bob', age: '25', notes: 'plain' } },
    ]);
  });

  it('supports a custom delimiter', async () => {
    const csv = ['name;age', 'Alice;30'].join('\n');
    const rows: ImportRow[] = [];
    for await (const row of readCsvRows(Readable.from(csv), {
      delimiter: ';',
    })) {
      rows.push(row);
    }
    expect(rows).toEqual([{ index: 0, values: { name: 'Alice', age: '30' } }]);
  });

  it('throws CsvFormatError when a row has the wrong number of columns', async () => {
    const csv = ['name,age', 'Alice,30,extra'].join('\n');
    const consume = async (): Promise<void> => {
      for await (const _row of readCsvRows(Readable.from(csv))) {
        void _row;
      }
    };
    await expect(consume()).rejects.toThrow(CsvFormatError);
  });

  it('reads rows and counts rows from an in-memory buffer', async () => {
    const csv = ['name,age', 'Alice,30', 'Bob,25'].join('\n');
    const buffer = Buffer.from(csv, 'utf8');
    const rows: ImportRow[] = [];
    for await (const row of readCsvRowsFromBuffer(buffer)) {
      rows.push(row);
    }
    expect(rows).toHaveLength(2);
    expect(await countCsvRows(buffer)).toBe(2);
  });

  it('counts zero rows for a header-only buffer', async () => {
    expect(await countCsvRows(Buffer.from('name,age\n'))).toBe(0);
  });
});

describe('imports platform / validation-pipeline', () => {
  it('passes when required fields are present and non-blank', () => {
    const validator = requiredFieldsValidator(['name', 'age']);
    const result = validator.validate({
      index: 0,
      values: { name: 'Alice', age: '30' },
    });
    expect(result).toEqual({ valid: true });
  });

  it('fails when required fields are missing or blank', () => {
    const validator = requiredFieldsValidator(['name', 'age']);
    const result = validator.validate({
      index: 0,
      values: { name: '  ', age: undefined as unknown as string },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Missing required field "name"',
      'Missing required field "age"',
    ]);
  });

  it('aggregates errors across multiple validators, using default messages when none are provided', async () => {
    const withoutMessage: RowValidator = {
      validate: () => ({ valid: false }),
    };
    const withMessages: RowValidator = {
      validate: () => Promise.resolve({ valid: false, errors: ['bad email'] }),
    };
    const passing: RowValidator = { validate: () => ({ valid: true }) };
    const pipeline = new ValidationPipeline([
      passing,
      withoutMessage,
      withMessages,
    ]);
    const result = await pipeline.validate({ index: 3, values: {} });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Row 3 failed validation', 'bad email']);
  });

  it('reports valid when there are no validators or all pass', async () => {
    const pipeline = new ValidationPipeline([]);
    expect(await pipeline.validate({ index: 0, values: {} })).toEqual({
      valid: true,
      errors: [],
    });
  });
});

describe('imports platform / duplicate-detector', () => {
  it('flags repeated keys and resets state', () => {
    const detector = new DuplicateDetector(
      columnDuplicateKeyExtractor('email'),
    );
    const rowA: ImportRow = { index: 0, values: { email: 'a@example.com' } };
    const rowB: ImportRow = { index: 1, values: { email: 'a@example.com' } };
    expect(detector.check(rowA)).toBe(false);
    expect(detector.check(rowB)).toBe(true);
    detector.reset();
    expect(detector.check(rowB)).toBe(false);
  });

  it('extracts an empty key when the column is absent', () => {
    const extractor = columnDuplicateKeyExtractor('email');
    expect(extractor.extractKey({ index: 0, values: {} })).toBe('');
  });
});

describe('imports platform / import.service', () => {
  function makeStorage(): jest.Mocked<StorageProvider> {
    return {
      name: 'fake',
      put: jest.fn().mockResolvedValue({ key: 'k', size: 0 }),
      get: jest.fn(),
      getStream: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      signedUrl: jest.fn(),
    };
  }

  function makeQueue(): jest.Mocked<QueueAdapter<ImportJobPayload>> {
    return {
      add: jest.fn().mockResolvedValue({
        id: 'q-1',
        payload: { jobId: 'job-1' },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
      remove: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getStatus: jest.fn(),
      process: jest.fn(),
    };
  }

  function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
    return {
      id: 'job-1',
      storageKey: 'imports/job-1/file.csv',
      status: 'pending',
      totalRows: 2,
      processedRows: 0,
      errorCount: 0,
      preview: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      errors: [],
      ...overrides,
    };
  }

  const csvContent = (): Buffer =>
    Buffer.from(
      ['name,email', 'Alice,alice@example.com', 'Bob,bob@example.com'].join(
        '\n',
      ),
    );

  it('uploads content, records a job, and enqueues it, returning immediately', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });

    const summary = await service.startImport({
      fileName: 'contacts.csv',
      content: csvContent(),
    });
    expect(summary.totalRows).toBe(2);
    expect(summary.status).toBe('pending');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('contacts.csv'),
      expect.any(Buffer),
      { contentType: 'text/csv' },
    );
    expect(queue.add).toHaveBeenCalledWith({ jobId: summary.jobId });

    const job = await service.getJob(summary.jobId);
    expect(job?.totalRows).toBe(2);
  });

  it('uses injected idFactory and clock when supplied', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const fixedDate = new Date('2026-05-05T00:00:00Z');
    const service = new ImportService({
      jobStore: store,
      storage,
      queue,
      idFactory: () => 'fixed-id',
      clock: () => fixedDate,
    });
    const summary = await service.startImport({
      fileName: 'a.csv',
      content: csvContent(),
      preview: true,
    });
    expect(summary.jobId).toBe('fixed-id');
    const job = await service.getJob('fixed-id');
    expect(job?.createdAt).toEqual(fixedDate);
    expect(job?.preview).toBe(true);
  });

  it('rejects rollback for an unknown job', async () => {
    const service = new ImportService({
      jobStore: new InMemoryImportJobStore(),
      storage: makeStorage(),
      queue: makeQueue(),
    });
    await expect(service.rollback('missing')).rejects.toThrow(
      ImportJobNotRegisteredError,
    );
  });

  it('rolls back without a hook when none was supplied', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const summary = await service.startImport({
      fileName: 'a.csv',
      content: csvContent(),
    });
    await service.rollback(summary.jobId);
    const job = await service.getJob(summary.jobId);
    expect(job?.status).toBe('rolled_back');
  });

  it('invokes the rollback hook when supplied', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const rollbackFn = jest.fn().mockResolvedValue(undefined);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content: csvContent(),
      rollback: { rollback: rollbackFn },
    });
    await service.rollback(summary.jobId);
    expect(rollbackFn).toHaveBeenCalledWith(summary.jobId);
  });

  it('throws when processing a job whose start options were never registered', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    await store.create(makeJob());
    const service = new ImportService({ jobStore: store, storage, queue });
    const processor = service.createProcessor();
    await expect(
      processor.process({
        id: 'q-1',
        payload: { jobId: 'job-1' },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
    ).rejects.toThrow(ImportJobNotRegisteredError);
  });

  it('throws when processing a job whose record is missing from the store', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    storage.put.mockResolvedValue({ key: 'k', size: 0 });
    await service.startImport({ fileName: 'a.csv', content: csvContent() });
    const jobs = await store.list();
    const jobId = jobs[0].id;
    // Simulate the record disappearing from the store between enqueue and processing.
    jest.spyOn(store, 'get').mockResolvedValueOnce(undefined);
    const processor = service.createProcessor();
    await expect(
      processor.process({
        id: 'q-1',
        payload: { jobId },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
    ).rejects.toThrow(ImportJobNotRegisteredError);
  });

  it('processes every row, invoking onRow, when not in preview mode', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const processed: ImportRow[] = [];
    const onRow = {
      process: (row: ImportRow) => {
        processed.push(row);
        return Promise.resolve();
      },
    };

    const content = csvContent();
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      onRow,
    });

    const processor = service.createProcessor();
    await processor.process({
      id: 'q-1',
      payload: { jobId: summary.jobId },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });

    expect(processed).toHaveLength(2);
    const job = await service.getJob(summary.jobId);
    expect(job?.status).toBe('completed');
    expect(job?.processedRows).toBe(2);
    expect(job?.errorCount).toBe(0);
  });

  it('skips onRow in preview mode but still validates and counts', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const onRow = { process: jest.fn().mockResolvedValue(undefined) };

    const content = csvContent();
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      preview: true,
      onRow,
      validators: [requiredFieldsValidator(['name', 'email'])],
    });

    const processor = service.createProcessor();
    await processor.process({
      id: 'q-1',
      payload: { jobId: summary.jobId },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });

    expect(onRow.process).not.toHaveBeenCalled();
    const job = await service.getJob(summary.jobId);
    expect(job?.status).toBe('completed');
    expect(job?.processedRows).toBe(2);
  });

  it('collects duplicate-row errors and skips validation/onRow for them', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const onRow = { process: jest.fn().mockResolvedValue(undefined) };

    const content = Buffer.from(
      ['name,email', 'Alice,dup@example.com', 'Bob,dup@example.com'].join('\n'),
    );
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      onRow,
      duplicateKey: columnDuplicateKeyExtractor('email'),
    });

    const processor = service.createProcessor();
    await processor.process({
      id: 'q-1',
      payload: { jobId: summary.jobId },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });

    expect(onRow.process).toHaveBeenCalledTimes(1);
    const job = await service.getJob(summary.jobId);
    expect(job?.errorCount).toBe(1);
    expect(job?.errors[0]).toMatchObject({ row: 1, message: 'Duplicate row' });
  });

  it('collects validation errors and skips onRow for invalid rows', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const onRow = { process: jest.fn().mockResolvedValue(undefined) };

    const content = Buffer.from(
      [
        'name,email',
        'Alice,alice@example.com',
        ',missing-name@example.com',
      ].join('\n'),
    );
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      onRow,
      validators: [requiredFieldsValidator(['name'])],
    });

    const processor = service.createProcessor();
    await processor.process({
      id: 'q-1',
      payload: { jobId: summary.jobId },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });

    expect(onRow.process).toHaveBeenCalledTimes(1);
    const job = await service.getJob(summary.jobId);
    expect(job?.errorCount).toBe(1);
    expect(job?.errors[0].message).toBe('Missing required field "name"');
  });

  it('marks the job failed and rethrows when row processing throws an Error', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const onRow = {
      process: jest.fn().mockRejectedValue(new Error('boom')),
    };

    const content = csvContent();
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      onRow,
    });

    const processor = service.createProcessor();
    await expect(
      processor.process({
        id: 'q-1',
        payload: { jobId: summary.jobId },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
    ).rejects.toThrow('boom');

    const job = await service.getJob(summary.jobId);
    expect(job?.status).toBe('failed');
  });

  it('marks the job failed and wraps a non-Error thrown value', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const onRow = {
      process: jest.fn().mockRejectedValue('not-an-error'),
    };

    const content = csvContent();
    storage.get.mockResolvedValue(content);
    const summary = await service.startImport({
      fileName: 'a.csv',
      content,
      onRow,
    });

    const processor = service.createProcessor();
    await expect(
      processor.process({
        id: 'q-1',
        payload: { jobId: summary.jobId },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
    ).rejects.toThrow('not-an-error');

    const job = await service.getJob(summary.jobId);
    expect(job?.status).toBe('failed');
  });

  it('exposes DI tokens', () => {
    expect(typeof IMPORT_JOB_STORE).toBe('symbol');
    expect(typeof IMPORT_QUEUE_ADAPTER).toBe('symbol');
    expect(typeof IMPORT_STORAGE_PROVIDER).toBe('symbol');
  });

  it('adapts the default id factory and default clock (no overrides supplied)', async () => {
    const storage = makeStorage();
    const queue = makeQueue();
    const store = new InMemoryImportJobStore();
    const service = new ImportService({ jobStore: store, storage, queue });
    const before = Date.now();
    const summary = await service.startImport({
      fileName: 'a.csv',
      content: csvContent(),
    });
    const job = await service.getJob(summary.jobId);
    expect(typeof summary.jobId).toBe('string');
    expect(summary.jobId.length).toBeGreaterThan(0);
    expect(job?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
