import { Injectable } from '@nestjs/common';
import { assertPositiveInteger } from '../../architecture/production-defaults';
import { FailedJob, FailedJobStorage } from './failed-job-storage.interface';

export interface InMemoryFailedJobStorageOptions {
  /** Maximum retained failed jobs. Defaults to 10_000. */
  readonly maxEntries?: number;
}

/**
 * Process-local failed-job DLQ. **Not durable** — entries are lost on restart.
 */
@Injectable()
export class InMemoryFailedJobStorage implements FailedJobStorage {
  private readonly failedJobs: FailedJob[] = [];
  private readonly maxEntries: number;

  public constructor(options: InMemoryFailedJobStorageOptions = {}) {
    this.maxEntries = assertPositiveInteger(
      options.maxEntries ?? 10_000,
      'InMemoryFailedJobStorage maxEntries',
    );
  }

  public save(failedJob: FailedJob): Promise<void> {
    if (this.failedJobs.length >= this.maxEntries) {
      return Promise.reject(
        new RangeError(
          `InMemoryFailedJobStorage is full (maxEntries=${this.maxEntries})`,
        ),
      );
    }
    this.failedJobs.push({
      ...failedJob,
      timestamp: new Date(failedJob.timestamp),
      payloadMetadata: Object.freeze({ ...failedJob.payloadMetadata }),
    });
    return Promise.resolve();
  }

  public list(): Promise<readonly FailedJob[]> {
    return Promise.resolve(
      this.failedJobs.map((failedJob) => ({
        ...failedJob,
        timestamp: new Date(failedJob.timestamp),
      })),
    );
  }

  public purge(): Promise<number> {
    const count = this.failedJobs.length;
    this.failedJobs.length = 0;
    return Promise.resolve(count);
  }
}
