import { randomUUID } from 'node:crypto';
import type { JobProcessor } from '../queue/contracts/job-processor.interface';
import type { Job } from '../queue/contracts/job.interface';
import type { QueueAdapter } from '../queue/contracts/queue-adapter.interface';
import type { StorageProvider } from '../storage/storage-provider.interface';
import { countCsvRows, readCsvRowsFromBuffer } from './csv-row-reader';
import { DuplicateDetector } from './duplicate-detector';
import type { ImportJobStore } from './import-job.store';
import { ValidationPipeline } from './validation-pipeline';
import type {
  ImportJob,
  ImportRowError,
  ImportSummary,
  StartImportOptions,
} from './import.types';

export interface ImportJobPayload {
  readonly jobId: string;
}

export interface ImportServiceOptions {
  readonly jobStore: ImportJobStore;
  readonly storage: StorageProvider;
  readonly queue: QueueAdapter<ImportJobPayload>;
  readonly idFactory?: () => string;
  readonly clock?: () => Date;
}

export class ImportJobNotRegisteredError extends Error {
  public constructor(jobId: string) {
    super(
      `Import job "${jobId}" is not registered for processing (worker restarted or job unknown)`,
    );
    this.name = 'ImportJobNotRegisteredError';
  }
}

const defaultIdFactory = (): string => randomUUID();
const defaultClock = (): Date => new Date();

/**
 * Coordinates async bulk CSV imports: uploads content to storage, records a
 * job, enqueues background processing, and never blocks the HTTP request
 * that started it. Call {@link ImportService.createProcessor} once per
 * process and hand it to a {@link QueueAdapter.process} call to actually run
 * jobs.
 */
export class ImportService {
  private readonly idFactory: () => string;
  private readonly clock: () => Date;
  private readonly pendingOptions = new Map<string, StartImportOptions>();

  public constructor(private readonly options: ImportServiceOptions) {
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.clock = options.clock ?? defaultClock;
  }

  /** Uploads content, records the job, and enqueues it. Resolves immediately. */
  public async startImport(
    startOptions: StartImportOptions,
  ): Promise<ImportSummary> {
    const jobId = this.idFactory();
    const storageKey = `imports/${jobId}/${startOptions.fileName}`;
    await this.options.storage.put(storageKey, startOptions.content, {
      contentType: 'text/csv',
    });

    const totalRows = await countCsvRows(startOptions.content);
    const now = this.clock();
    const job: ImportJob = {
      id: jobId,
      storageKey,
      status: 'pending',
      totalRows,
      processedRows: 0,
      errorCount: 0,
      preview: startOptions.preview ?? false,
      createdAt: now,
      updatedAt: now,
      errors: [],
    };
    await this.options.jobStore.create(job);
    this.pendingOptions.set(jobId, startOptions);
    await this.options.queue.add({ jobId });

    return { jobId, totalRows, status: job.status };
  }

  public getJob(jobId: string): Promise<ImportJob | undefined> {
    return this.options.jobStore.get(jobId);
  }

  /** Invokes the caller's rollback hook (if any) and marks the job rolled back. */
  public async rollback(jobId: string): Promise<void> {
    const job = await this.options.jobStore.get(jobId);
    if (!job) {
      throw new ImportJobNotRegisteredError(jobId);
    }
    const startOptions = this.pendingOptions.get(jobId);
    if (startOptions?.rollback) {
      await startOptions.rollback.rollback(jobId);
    }
    await this.options.jobStore.update(jobId, { status: 'rolled_back' });
  }

  /** Adapts this service to a {@link JobProcessor} for a {@link QueueAdapter}. */
  public createProcessor(): JobProcessor<ImportJobPayload> {
    return { process: (job) => this.processJob(job) };
  }

  private async processJob(job: Job<ImportJobPayload>): Promise<void> {
    const jobId = job.payload.jobId;
    const startOptions = this.pendingOptions.get(jobId);
    const record = await this.options.jobStore.get(jobId);
    if (!startOptions || !record) {
      throw new ImportJobNotRegisteredError(jobId);
    }

    await this.options.jobStore.update(jobId, {
      status: startOptions.preview ? 'validating' : 'processing',
    });

    const content = await this.options.storage.get(record.storageKey);
    const pipeline = startOptions.validators
      ? new ValidationPipeline(startOptions.validators)
      : undefined;
    const duplicateDetector = startOptions.duplicateKey
      ? new DuplicateDetector(startOptions.duplicateKey)
      : undefined;

    const errors: ImportRowError[] = [];
    let processed = 0;
    try {
      for await (const row of readCsvRowsFromBuffer(content)) {
        processed += 1;

        if (duplicateDetector?.check(row)) {
          errors.push({
            row: row.index,
            message: 'Duplicate row',
            data: row.values,
          });
          await this.reportProgress(jobId, processed, errors);
          continue;
        }

        if (pipeline) {
          const result = await pipeline.validate(row);
          if (!result.valid) {
            errors.push(
              ...result.errors.map((message) => ({
                row: row.index,
                message,
                data: row.values,
              })),
            );
            await this.reportProgress(jobId, processed, errors);
            continue;
          }
        }

        if (!startOptions.preview && startOptions.onRow) {
          await startOptions.onRow.process(row);
        }
        await this.reportProgress(jobId, processed, errors);
      }

      await this.options.jobStore.update(jobId, {
        status: 'completed',
        processedRows: processed,
        errorCount: errors.length,
        errors,
      });
    } catch (error: unknown) {
      await this.options.jobStore.update(jobId, {
        status: 'failed',
        processedRows: processed,
        errorCount: errors.length,
        errors,
      });
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      this.pendingOptions.delete(jobId);
    }
  }

  private async reportProgress(
    jobId: string,
    processedRows: number,
    errors: readonly ImportRowError[],
  ): Promise<void> {
    await this.options.jobStore.update(jobId, {
      processedRows,
      errorCount: errors.length,
      errors: [...errors],
    });
  }
}
