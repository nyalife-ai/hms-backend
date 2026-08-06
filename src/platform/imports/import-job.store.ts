import type { ImportJob } from './import.types';

export class ImportJobNotFoundError extends Error {
  public constructor(jobId: string) {
    super(`Import job "${jobId}" was not found`);
    this.name = 'ImportJobNotFoundError';
  }
}

export interface ImportJobStore {
  create(job: ImportJob): Promise<void>;
  get(jobId: string): Promise<ImportJob | undefined>;
  update(jobId: string, patch: Partial<ImportJob>): Promise<ImportJob>;
  list(): Promise<readonly ImportJob[]>;
}

/**
 * Process-local job store for tests and single-process deployments. Not
 * durable — replace with a persisted store (DB/Redis) for production use
 * across multiple workers/processes.
 */
export class InMemoryImportJobStore implements ImportJobStore {
  private readonly jobs = new Map<string, ImportJob>();

  public create(job: ImportJob): Promise<void> {
    this.jobs.set(job.id, job);
    return Promise.resolve();
  }

  public get(jobId: string): Promise<ImportJob | undefined> {
    return Promise.resolve(this.jobs.get(jobId));
  }

  public update(jobId: string, patch: Partial<ImportJob>): Promise<ImportJob> {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return Promise.reject(new ImportJobNotFoundError(jobId));
    }
    const updated: ImportJob = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.jobs.set(jobId, updated);
    return Promise.resolve(updated);
  }

  public list(): Promise<readonly ImportJob[]> {
    return Promise.resolve([...this.jobs.values()]);
  }
}
