import { Job } from '../contracts/job.interface';
import { FailedJob, FailedJobStorage } from './failed-job-storage.interface';

export type DeadLetterClock = () => Date;

export class DeadLetterService {
  public constructor(
    private readonly storage: FailedJobStorage,
    private readonly clock: DeadLetterClock = () => new Date(),
  ) {}

  public async record<TPayload>(
    job: Job<TPayload>,
    error: unknown,
  ): Promise<FailedJob> {
    const normalized = this.toError(error);
    const failedJob: FailedJob = {
      jobId: job.id,
      error: normalized.message,
      stack: normalized.stack,
      attemptCount: job.attempts,
      timestamp: this.clock(),
      payloadMetadata: job.metadata,
    };
    await this.storage.save(failedJob);
    return failedJob;
  }

  public async list(): Promise<readonly FailedJob[]> {
    return this.storage.list();
  }

  public async purge(): Promise<number> {
    return this.storage.purge();
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
