import { assertPositiveInteger } from '../../architecture/production-defaults';
import { Job, JobOptions, JobStatus } from '../contracts/job.interface';
import { JobProcessor } from '../contracts/job-processor.interface';
import {
  ProcessOptions,
  QueueAdapter,
} from '../contracts/queue-adapter.interface';
import { JobFactory } from './job.factory';

type TimerHandle = ReturnType<typeof setTimeout>;
export interface QueueTimer {
  setTimeout(callback: () => void, milliseconds: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultTimer: QueueTimer = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle),
};

export interface InMemoryQueueOptions {
  /** Maximum waiting jobs. Defaults to 10_000. */
  readonly maxWaiting?: number;
  /** Maximum retained job records (including completed/failed). Defaults to 10_000. */
  readonly maxJobs?: number;
}

/**
 * Process-local queue for tests and single-process development.
 * **Not durable** — jobs are lost on process restart. Prefer a durable adapter
 * (Redis/SQS/etc.) in production.
 */
export class InMemoryQueueAdapter<TPayload> implements QueueAdapter<TPayload> {
  /** Explicitly marks this adapter as non-durable. */
  public readonly durable = false as const;

  private readonly jobs = new Map<string, Job<TPayload>>();
  private readonly statuses = new Map<string, JobStatus>();
  private readonly waiting: Job<TPayload>[] = [];
  private readonly completedOrder: string[] = [];
  private readonly maxWaiting: number;
  private readonly maxJobs: number;
  private paused = false;
  private processingPromise: Promise<void> | undefined;

  public constructor(
    private readonly jobFactory: JobFactory = new JobFactory(),
    private readonly timer: QueueTimer = defaultTimer,
    options: InMemoryQueueOptions = {},
  ) {
    this.maxWaiting = assertPositiveInteger(
      options.maxWaiting ?? 10_000,
      'InMemoryQueueAdapter maxWaiting',
    );
    this.maxJobs = assertPositiveInteger(
      options.maxJobs ?? 10_000,
      'InMemoryQueueAdapter maxJobs',
    );
  }

  public add(
    payload: TPayload,
    options: JobOptions = {},
  ): Promise<Job<TPayload>> {
    if (this.waiting.length >= this.maxWaiting) {
      return Promise.reject(
        new RangeError(
          `InMemoryQueueAdapter waiting queue is full (maxWaiting=${this.maxWaiting})`,
        ),
      );
    }
    this.evictCompletedIfNeeded();
    if (this.jobs.size >= this.maxJobs) {
      return Promise.reject(
        new RangeError(
          `InMemoryQueueAdapter job state is full (maxJobs=${this.maxJobs})`,
        ),
      );
    }
    const job = this.jobFactory.create(payload, options);
    this.jobs.set(job.id, job);
    this.statuses.set(job.id, this.paused ? 'paused' : 'waiting');
    this.waiting.push(job);
    this.waiting.sort(
      (left, right) =>
        right.priority - left.priority ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );
    return Promise.resolve(job);
  }

  public remove(jobId: string): Promise<boolean> {
    const index = this.waiting.findIndex((job) => job.id === jobId);
    if (index < 0) {
      return Promise.resolve(false);
    }
    this.waiting.splice(index, 1);
    this.jobs.delete(jobId);
    this.statuses.delete(jobId);
    return Promise.resolve(true);
  }

  public pause(): Promise<void> {
    this.paused = true;
    this.waiting.forEach((job) => this.statuses.set(job.id, 'paused'));
    return Promise.resolve();
  }

  public resume(): Promise<void> {
    this.paused = false;
    this.waiting.forEach((job) => this.statuses.set(job.id, 'waiting'));
    return Promise.resolve();
  }

  public getStatus(jobId: string): Promise<JobStatus | undefined> {
    return Promise.resolve(this.statuses.get(jobId));
  }

  public process<TResult>(
    processor: JobProcessor<TPayload, TResult>,
    options: ProcessOptions = {},
  ): Promise<void> {
    if (this.processingPromise) {
      return this.processingPromise;
    }
    const concurrency = options.concurrency ?? 1;
    const timeoutMs = options.timeoutMs;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      return Promise.reject(
        new RangeError('Queue concurrency must be a positive integer'),
      );
    }
    if (
      timeoutMs !== undefined &&
      (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    ) {
      return Promise.reject(
        new RangeError('Queue timeout must be a positive finite number'),
      );
    }
    const errors: Error[] = [];
    const run = Promise.all(
      Array.from({ length: concurrency }, () =>
        this.runWorker(processor, timeoutMs, options.signal, errors),
      ),
    ).then(() => {
      if (errors.length > 0) {
        throw new AggregateError(errors, 'One or more queue jobs failed');
      }
    });
    this.processingPromise = run.finally(() => {
      this.processingPromise = undefined;
    });
    return this.processingPromise;
  }

  public getDepth(): number {
    return this.waiting.length;
  }

  private async runWorker<TResult>(
    processor: JobProcessor<TPayload, TResult>,
    timeoutMs: number | undefined,
    parentSignal: AbortSignal | undefined,
    errors: Error[],
  ): Promise<void> {
    while (!this.paused) {
      if (parentSignal?.aborted) {
        return;
      }
      const job = this.waiting.shift();
      if (!job) {
        return;
      }
      this.statuses.set(job.id, 'active');
      job.attempts += 1;
      const controller = new AbortController();
      const onParentAbort = (): void => {
        controller.abort(parentSignal?.reason);
      };
      if (parentSignal) {
        if (parentSignal.aborted) {
          controller.abort(parentSignal.reason);
        } else {
          parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }
      }
      try {
        await this.runWithTimeout(
          processor.process(job, controller.signal),
          timeoutMs,
          controller,
        );
        this.statuses.set(job.id, 'completed');
        this.trackTerminal(job.id);
      } catch (error: unknown) {
        this.statuses.set(job.id, 'failed');
        this.trackTerminal(job.id);
        errors.push(this.toError(error));
      } finally {
        parentSignal?.removeEventListener('abort', onParentAbort);
      }
    }
  }

  private async runWithTimeout<TResult>(
    operation: Promise<TResult>,
    timeoutMs: number | undefined,
    controller: AbortController,
  ): Promise<TResult> {
    if (timeoutMs === undefined) {
      if (controller.signal.aborted) {
        throw this.abortReason(controller.signal);
      }
      return operation;
    }
    return new Promise<TResult>((resolve, reject) => {
      const handle = this.timer.setTimeout(() => {
        const timeoutError = new Error(`Job timed out after ${timeoutMs}ms`);
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
      const onAbort = (): void => {
        this.timer.clearTimeout(handle);
        reject(this.abortReason(controller.signal));
      };
      if (controller.signal.aborted) {
        this.timer.clearTimeout(handle);
        reject(this.abortReason(controller.signal));
        return;
      }
      controller.signal.addEventListener('abort', onAbort, { once: true });
      operation.then(
        (value) => {
          this.timer.clearTimeout(handle);
          controller.signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          this.timer.clearTimeout(handle);
          controller.signal.removeEventListener('abort', onAbort);
          reject(this.toError(error));
        },
      );
    });
  }

  private abortReason(signal: AbortSignal): Error {
    const reason: unknown = signal.reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (reason === undefined || reason === null) {
      return new Error('Job aborted');
    }
    if (
      typeof reason === 'string' ||
      typeof reason === 'number' ||
      typeof reason === 'boolean' ||
      typeof reason === 'bigint'
    ) {
      return new Error(String(reason));
    }
    try {
      return new Error(JSON.stringify(reason));
    } catch {
      return new Error('Job aborted');
    }
  }

  private trackTerminal(jobId: string): void {
    this.completedOrder.push(jobId);
    this.evictCompletedIfNeeded();
  }

  private evictCompletedIfNeeded(): void {
    while (this.jobs.size >= this.maxJobs && this.completedOrder.length > 0) {
      const id = this.completedOrder.shift();
      if (!id) {
        return;
      }
      const status = this.statuses.get(id);
      if (status === 'completed' || status === 'failed') {
        this.jobs.delete(id);
        this.statuses.delete(id);
      }
    }
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
