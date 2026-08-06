import { Job, JobOptions, JobStatus } from './job.interface';
import { JobProcessor } from './job-processor.interface';

export interface ProcessOptions {
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  /** Cooperative cancellation signal forwarded to processors. */
  readonly signal?: AbortSignal;
}

export interface QueueAdapter<TPayload> {
  add(payload: TPayload, options?: JobOptions): Promise<Job<TPayload>>;
  remove(jobId: string): Promise<boolean>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getStatus(jobId: string): Promise<JobStatus | undefined>;
  process<TResult>(
    processor: JobProcessor<TPayload, TResult>,
    options?: ProcessOptions,
  ): Promise<void>;
}
