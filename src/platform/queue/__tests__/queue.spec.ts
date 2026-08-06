import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import * as queueExports from '../index';
import { Job } from '../contracts/job.interface';
import {
  FAILED_JOB_STORAGE,
  QUEUE_ADAPTER,
  QUEUE_METRICS,
} from '../contracts/queue.tokens';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { InMemoryFailedJobStorage } from '../dead-letter/in-memory-failed-job.storage';
import { QueueMetricsCollector } from '../monitoring/queue-metrics.collector';
import { BaseProcessor } from '../processors/base-processor';
import {
  InMemoryQueueAdapter,
  QueueTimer,
} from '../providers/in-memory-queue.adapter';
import { JobFactory } from '../providers/job.factory';
import { QueueModule } from '../queue.module';
import { RetryExecutor } from '../retry/retry-executor';
import { RetryPolicy } from '../retry/retry-policy';
import { JobScheduleTimer, JobScheduler } from '../scheduling/job-scheduler';

const makeJob = (attempts = 0): Job<{ readonly value: number }> => ({
  id: 'job-1',
  payload: { value: 1 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  priority: 0,
  attempts,
  maxAttempts: 3,
  metadata: { source: 'test' },
});

describe('queue platform', () => {
  it('creates immutable jobs and validates options', () => {
    const factory = new JobFactory(
      () => new Date('2026-01-01T00:00:00Z'),
      () => 'fixed-id',
    );
    expect(factory.create({ value: 1 })).toEqual({
      id: 'fixed-id',
      payload: { value: 1 },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });
    const configured = factory.create('payload', {
      priority: 4,
      maxAttempts: 5,
      metadata: { trace: 'yes' },
    });
    expect(configured.priority).toBe(4);
    expect(configured.maxAttempts).toBe(5);
    expect(Object.isFrozen(configured.metadata)).toBe(true);
    expect(() => factory.create('bad', { priority: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => factory.create('bad', { maxAttempts: 0 })).toThrow(RangeError);
    expect(() => factory.create('bad', { maxAttempts: 1.5 })).toThrow(
      RangeError,
    );
  });

  it('orders jobs by priority, preserves FIFO ties, and removes waiting jobs', async () => {
    let id = 0;
    let time = 0;
    const factory = new JobFactory(
      () => new Date(time++),
      () => `job-${++id}`,
    );
    const queue = new InMemoryQueueAdapter<string>(factory);
    const low = await queue.add('low', { priority: 0 });
    const high = await queue.add('high', { priority: 10 });
    const highTwo = await queue.add('high-two', { priority: 10 });
    expect(queue.getDepth()).toBe(3);
    expect(await queue.remove('missing')).toBe(false);
    expect(await queue.remove(low.id)).toBe(true);
    expect(await queue.getStatus(low.id)).toBeUndefined();
    const seen: string[] = [];
    await queue.process({
      process: async (job): Promise<void> => {
        seen.push(job.payload);
      },
    });
    expect(seen).toEqual(['high', 'high-two']);
    expect(await queue.getStatus(high.id)).toBe('completed');
    expect(await queue.getStatus(highTwo.id)).toBe('completed');
    expect(await queue.remove(high.id)).toBe(false);
  });

  it('pauses, resumes, and stops workers safely', async () => {
    const queue = new InMemoryQueueAdapter<number>();
    const first = await queue.add(1);
    const second = await queue.add(2);
    await queue.pause();
    const pausedAddition = await queue.add(3);
    expect(await queue.getStatus(first.id)).toBe('paused');
    expect(await queue.getStatus(pausedAddition.id)).toBe('paused');
    await queue.process({ process: async (): Promise<void> => undefined });
    expect(queue.getDepth()).toBe(3);
    await queue.resume();
    expect(await queue.getStatus(first.id)).toBe('waiting');
    await queue.process({
      process: async (job): Promise<void> => {
        if (job.payload === 1) {
          await queue.pause();
        }
      },
    });
    expect(await queue.getStatus(first.id)).toBe('completed');
    expect(await queue.getStatus(second.id)).toBe('paused');
    await queue.resume();
    await queue.process({ process: async (): Promise<void> => undefined });
    expect(await queue.getStatus(second.id)).toBe('completed');
  });

  it('processes concurrently and shares an active processing loop', async () => {
    const queue = new InMemoryQueueAdapter<number>();
    await Promise.all([1, 2, 3, 4].map((value) => queue.add(value)));
    let active = 0;
    let maximum = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processor = {
      process: async (): Promise<void> => {
        active += 1;
        maximum = Math.max(maximum, active);
        await gate;
        active -= 1;
      },
    };
    const firstRun = queue.process(processor, { concurrency: 2 });
    const secondRun = queue.process(processor, { concurrency: 4 });
    expect(secondRun).toBe(firstRun);
    await Promise.resolve();
    expect(maximum).toBe(2);
    release?.();
    await firstRun;
  });

  it('records failures, timeouts, and recovers on later processing', async () => {
    jest.useFakeTimers();
    const queue = new InMemoryQueueAdapter<string>();
    const rejected = await queue.add('reject');
    const nonError = await queue.add('non-error');
    await expect(
      queue.process(
        {
          process: async (job): Promise<void> => {
            if (job.payload === 'reject') {
              throw new Error('failed');
            }
            throw 'plain failure';
          },
        },
        { concurrency: 2 },
      ),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(await queue.getStatus(rejected.id)).toBe('failed');
    expect(await queue.getStatus(nonError.id)).toBe('failed');

    const timeoutQueue = new InMemoryQueueAdapter<string>();
    const timed = await timeoutQueue.add('slow');
    const timeoutRun = timeoutQueue.process(
      { process: async () => new Promise<void>(() => undefined) },
      { timeoutMs: 10 },
    );
    const timeoutExpectation =
      expect(timeoutRun).rejects.toBeInstanceOf(AggregateError);
    await jest.advanceTimersByTimeAsync(10);
    await timeoutExpectation;
    expect(await timeoutQueue.getStatus(timed.id)).toBe('failed');

    const recovered = await timeoutQueue.add('fast');
    await timeoutQueue.process(
      { process: async (): Promise<string> => 'ok' },
      { timeoutMs: 10 },
    );
    expect(await timeoutQueue.getStatus(recovered.id)).toBe('completed');

    const failedQuickly = await timeoutQueue.add('quick-failure');
    await expect(
      timeoutQueue.process(
        {
          process: async (): Promise<void> => {
            throw new Error('quick');
          },
        },
        { timeoutMs: 10 },
      ),
    ).rejects.toThrow('queue jobs failed');
    expect(await timeoutQueue.getStatus(failedQuickly.id)).toBe('failed');
    jest.useRealTimers();
  });

  it('validates processing options', async () => {
    const queue = new InMemoryQueueAdapter<void>();
    const processor = { process: async (): Promise<void> => undefined };
    await expect(queue.process(processor, { concurrency: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(
      queue.process(processor, { concurrency: 1.2 }),
    ).rejects.toThrow(RangeError);
    await expect(queue.process(processor, { timeoutMs: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(
      queue.process(processor, { timeoutMs: Number.NaN }),
    ).rejects.toThrow(RangeError);
  });

  it('supports injected timeout controls', async () => {
    let callback: (() => void) | undefined;
    let cleared = 0;
    const timer: QueueTimer = {
      setTimeout: (next): ReturnType<typeof setTimeout> => {
        callback = next;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (): void => {
        cleared += 1;
      },
    };
    const success = new InMemoryQueueAdapter<number>(new JobFactory(), timer);
    await success.add(1);
    await success.process(
      { process: async (): Promise<number> => 1 },
      { timeoutMs: 5 },
    );
    expect(cleared).toBe(1);

    const timeout = new InMemoryQueueAdapter<number>(new JobFactory(), timer);
    await timeout.add(1);
    const run = timeout.process(
      { process: async () => new Promise<void>(() => undefined) },
      { timeoutMs: 5 },
    );
    const timeoutExpectation =
      expect(run).rejects.toBeInstanceOf(AggregateError);
    callback?.();
    await timeoutExpectation;
  });

  it('computes retry policies and executes retry paths', async () => {
    const exponential = new RetryPolicy({
      maxAttempts: 3,
      delayMs: 10,
      jitter: 0.5,
      random: () => 1,
    });
    expect(exponential.computeDelay(2)).toBe(30);
    expect(exponential.shouldRetry(new Error('x'), 1)).toBe(true);
    expect(exponential.shouldRetry(new Error('x'), 3)).toBe(false);
    const fixed = new RetryPolicy({
      delayMs: 10,
      backoff: 'fixed',
      jitter: 1,
      random: () => 0,
      retryIf: (_error, attempt) => attempt < 2,
    });
    expect(fixed.computeDelay(1)).toBe(0);
    expect(fixed.shouldRetry('x', 1)).toBe(true);
    expect(fixed.shouldRetry('x', 2)).toBe(false);
    expect(() => fixed.computeDelay(0)).toThrow(RangeError);
    expect(() => new RetryPolicy({ maxAttempts: 0 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ delayMs: -1 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ jitter: -1 })).toThrow(RangeError);
    expect(() => new RetryPolicy({ jitter: 2 })).toThrow(RangeError);

    const sleeps: number[] = [];
    const executor = new RetryExecutor(async (delay) => {
      sleeps.push(delay);
    });
    const attempts: number[] = [];
    const result = await executor.execute(async (attempt) => {
      attempts.push(attempt);
      if (attempt < 3) {
        throw new Error('retry');
      }
      return 'done';
    }, exponential);
    expect(result).toBe('done');
    expect(attempts).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([15, 30]);
    await expect(
      executor.execute(
        async () => {
          throw new Error('final');
        },
        new RetryPolicy({ maxAttempts: 1 }),
      ),
    ).rejects.toThrow('final');
    let zeroDelayAttempts = 0;
    await executor.execute(
      async () => {
        zeroDelayAttempts += 1;
        if (zeroDelayAttempts === 1) {
          throw new Error('zero-delay retry');
        }
        return true;
      },
      new RetryPolicy({ maxAttempts: 2, delayMs: 0 }),
    );
    expect(
      await executor.execute(
        async (attempt) => attempt,
        new RetryPolicy({ delayMs: 0 }),
      ),
    ).toBe(1);
    const defaultExecutor = new RetryExecutor();
    let defaultAttempts = 0;
    await defaultExecutor.execute(
      async () => {
        defaultAttempts += 1;
        if (defaultAttempts === 1) {
          throw new Error('wait once');
        }
        return true;
      },
      new RetryPolicy({ maxAttempts: 2, delayMs: 1 }),
    );
    expect(new RetryPolicy({ delayMs: 1 }).computeDelay(1)).toBe(1);
    expect(new RetryPolicy().maxAttempts).toBe(3);
  });

  it('stores, lists, and purges dead letters', async () => {
    const storage = new InMemoryFailedJobStorage();
    const service = new DeadLetterService(
      storage,
      () => new Date('2026-02-01T00:00:00Z'),
    );
    const failed = await service.record(makeJob(2), new Error('broken'));
    expect(failed.error).toBe('broken');
    expect(failed.attemptCount).toBe(2);
    await service.record(makeJob(3), 'plain');
    await new DeadLetterService(storage).record(makeJob(), 'default clock');
    const listed = await service.list();
    expect(listed).toHaveLength(3);
    expect(listed[1].error).toBe('plain');
    expect(listed[0]).not.toBe(failed);
    expect(await service.purge()).toBe(3);
    expect(await service.purge()).toBe(0);
  });

  it('tracks metrics and validates measurements', () => {
    const metrics = new QueueMetricsCollector();
    expect(metrics.snapshot().avgDurationMs).toBe(0);
    metrics.recordProcessed(10);
    metrics.recordProcessed(20);
    metrics.recordFailed();
    metrics.recordRetry();
    metrics.setDepth(4);
    expect(metrics.snapshot()).toEqual({
      processed: 2,
      failed: 1,
      avgDurationMs: 15,
      depth: 4,
      retries: 1,
    });
    expect(() => metrics.recordProcessed(-1)).toThrow(RangeError);
    expect(() => metrics.recordProcessed(Number.NaN)).toThrow(RangeError);
    expect(() => metrics.setDepth(-1)).toThrow(RangeError);
    expect(() => metrics.setDepth(1.5)).toThrow(RangeError);
  });

  it('runs processor success and failure hooks', async () => {
    class Processor extends BaseProcessor<{ readonly value: number }, number> {
      public readonly hooks: string[] = [];
      public fail = false;

      protected async handle(
        job: Job<{ readonly value: number }>,
      ): Promise<number> {
        if (this.fail) {
          throw new Error('handle failed');
        }
        return job.payload.value;
      }

      protected async onSuccess(
        _job: Job<{ readonly value: number }>,
        _result: number,
      ): Promise<void> {
        this.hooks.push('success');
      }

      protected async onFailure(
        _job: Job<{ readonly value: number }>,
        _error: unknown,
      ): Promise<void> {
        this.hooks.push('failure');
      }
    }
    const processor = new Processor();
    await expect(processor.process(makeJob())).resolves.toBe(1);
    processor.fail = true;
    await expect(processor.process(makeJob())).rejects.toThrow('handle failed');
    expect(processor.hooks).toEqual(['success', 'failure']);

    class Defaults extends BaseProcessor<void, void> {
      public fail = false;

      protected async handle(_job: Job<void>): Promise<void> {}
    }
    const defaults = new Defaults();
    await defaults.process({ ...makeJob(), payload: undefined });
    class DefaultFailure extends BaseProcessor<void, void> {
      protected async handle(_job: Job<void>): Promise<void> {
        throw new Error('default failure hook');
      }
    }
    await expect(
      new DefaultFailure().process({ ...makeJob(), payload: undefined }),
    ).rejects.toThrow('default failure hook');
  });

  it('schedules delayed and repeated queue jobs', async () => {
    jest.useFakeTimers();
    const queue = new InMemoryQueueAdapter<string>();
    const scheduler = new JobScheduler(queue);
    const delayed = scheduler.scheduleDelayed('later', 10, { priority: 2 });
    const cancelled = scheduler.scheduleDelayed('never', 10);
    cancelled.cancel();
    await jest.advanceTimersByTimeAsync(10);
    expect(queue.getDepth()).toBe(1);
    delayed.cancel();

    const repeated = scheduler.scheduleRepeated('repeat', 5, {}, 2);
    await jest.advanceTimersByTimeAsync(20);
    expect(queue.getDepth()).toBe(3);
    repeated.cancel();
    const unlimited = scheduler.scheduleRepeated('unlimited', 5);
    await jest.advanceTimersByTimeAsync(5);
    unlimited.cancel();
    expect(queue.getDepth()).toBe(4);
    expect(() => scheduler.scheduleDelayed('bad', 0)).toThrow(RangeError);
    expect(() => scheduler.scheduleDelayed('bad', Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => scheduler.scheduleRepeated('bad', 1, {}, 0)).toThrow(
      RangeError,
    );
    expect(() => scheduler.scheduleRepeated('bad', 1, {}, 1.5)).toThrow(
      RangeError,
    );
    jest.useRealTimers();
  });

  it('supports injected job scheduling timers', () => {
    const callbacks: Array<() => void> = [];
    let clearedTimeouts = 0;
    let clearedIntervals = 0;
    const timer: JobScheduleTimer = {
      setTimeout: (callback): ReturnType<typeof setTimeout> => {
        callbacks.push(callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (): void => {
        clearedTimeouts += 1;
      },
      setInterval: (callback): ReturnType<typeof setInterval> => {
        callbacks.push(callback);
        return 2 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (): void => {
        clearedIntervals += 1;
      },
    };
    const queue = new InMemoryQueueAdapter<string>();
    const scheduler = new JobScheduler(queue, timer);
    const delayed = scheduler.scheduleDelayed('delayed', 1);
    callbacks[0]();
    delayed.cancel();
    const cancelled = scheduler.scheduleDelayed('cancelled', 1);
    cancelled.cancel();
    callbacks[1]();
    const repeated = scheduler.scheduleRepeated('repeat', 1, {}, 1);
    callbacks[2]();
    repeated.cancel();
    expect(clearedTimeouts).toBe(2);
    expect(clearedIntervals).toBe(2);
  });

  it('wires default and overridden module providers and exports', async () => {
    expect(queueExports.QueueModule).toBe(QueueModule);
    expect(typeof queueExports.QUEUE_ADAPTER).toBe('symbol');
    const defaults = await Test.createTestingModule({
      imports: [QueueModule.register()],
    }).compile();
    expect(defaults.get(QUEUE_ADAPTER)).toBeInstanceOf(InMemoryQueueAdapter);
    expect(defaults.get(FAILED_JOB_STORAGE)).toBeInstanceOf(
      InMemoryFailedJobStorage,
    );
    expect(defaults.get(QUEUE_METRICS)).toBeInstanceOf(QueueMetricsCollector);
    expect(defaults.get(DeadLetterService)).toBeInstanceOf(DeadLetterService);
    expect(defaults.get(RetryExecutor)).toBeInstanceOf(RetryExecutor);
    expect(defaults.get(JobScheduler)).toBeInstanceOf(JobScheduler);
    await defaults.close();

    const adapter = new InMemoryQueueAdapter<unknown>();
    const storage = new InMemoryFailedJobStorage();
    const metrics = new QueueMetricsCollector();
    const custom = await Test.createTestingModule({
      imports: [
        QueueModule.register({
          adapter,
          failedJobStorage: storage,
          metrics,
        }),
      ],
    }).compile();
    expect(custom.get(QUEUE_ADAPTER)).toBe(adapter);
    expect(custom.get(FAILED_JOB_STORAGE)).toBe(storage);
    expect(custom.get(QUEUE_METRICS)).toBe(metrics);
    await custom.close();
  });

  it('fails fast in production without durable queue providers', () => {
    expect(() => QueueModule.register({ isProduction: true })).toThrow(
      /durable adapter/,
    );
    expect(() =>
      QueueModule.register({
        isProduction: true,
        adapter: new InMemoryQueueAdapter(),
      }),
    ).toThrow(/failedJobStorage/);
    expect(() =>
      QueueModule.register({
        isProduction: true,
        adapter: { add: async () => ({ id: '1' }) } as never,
        failedJobStorage: new InMemoryFailedJobStorage(),
      }),
    ).toThrow(/metrics/);
    expect(() =>
      QueueModule.register({
        isProduction: true,
        adapter: new InMemoryQueueAdapter(),
        failedJobStorage: new InMemoryFailedJobStorage(),
        metrics: new QueueMetricsCollector(),
      }),
    ).toThrow(/not durable/);
    expect(() =>
      QueueModule.register({
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();
    expect(new InMemoryQueueAdapter().durable).toBe(false);
    expect(
      () => new InMemoryQueueAdapter(undefined, undefined, { maxWaiting: 0 }),
    ).toThrow(RangeError);
    expect(() => new InMemoryFailedJobStorage({ maxEntries: 0 })).toThrow(
      RangeError,
    );
  });

  it('bounds in-memory queue and DLQ state', async () => {
    const waitingQueue = new InMemoryQueueAdapter<string>(
      undefined,
      undefined,
      {
        maxWaiting: 1,
        maxJobs: 10,
      },
    );
    await waitingQueue.add('a');
    await expect(waitingQueue.add('b')).rejects.toThrow(
      /waiting queue is full/,
    );

    const jobQueue = new InMemoryQueueAdapter<string>(undefined, undefined, {
      maxWaiting: 5,
      maxJobs: 1,
    });
    await jobQueue.add('a');
    await expect(jobQueue.add('b')).rejects.toThrow(/job state is full/);

    const storage = new InMemoryFailedJobStorage({ maxEntries: 1 });
    await storage.save({
      jobId: '1',
      error: 'x',
      stack: undefined,
      attemptCount: 1,
      timestamp: new Date(),
      payloadMetadata: {},
    });
    await expect(
      storage.save({
        jobId: '2',
        error: 'y',
        stack: undefined,
        attemptCount: 1,
        timestamp: new Date(),
        payloadMetadata: {},
      }),
    ).rejects.toThrow(/full/);
  });

  it('covers abort signals, abort reasons, and completed-job eviction', async () => {
    const preAbort = new AbortController();
    preAbort.abort(new Error('pre-aborted'));
    const preAbortQueue = new InMemoryQueueAdapter<string>();
    await preAbortQueue.add('skip');
    await preAbortQueue.process(
      { process: async (): Promise<void> => undefined },
      { signal: preAbort.signal },
    );
    expect(preAbortQueue.getDepth()).toBe(1);

    const midAbort = new AbortController();
    const midQueue = new InMemoryQueueAdapter<string>();
    await midQueue.add('work');
    const midRun = midQueue.process(
      {
        process: async (_job, signal): Promise<void> =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(new Error('mid-abort'));
              },
              { once: true },
            );
          }),
      },
      { signal: midAbort.signal },
    );
    await Promise.resolve();
    midAbort.abort({ code: 7 });
    await expect(midRun).rejects.toBeInstanceOf(AggregateError);

    const flip = (reason: unknown): AbortSignal => {
      let reads = 0;
      return {
        get aborted(): boolean {
          reads += 1;
          return reads > 1;
        },
        reason,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
      } as AbortSignal;
    };

    const flipQueue = new InMemoryQueueAdapter<string>();
    await flipQueue.add('flip');
    await expect(
      flipQueue.process(
        { process: async (): Promise<void> => undefined },
        { signal: flip(new Error('flipped')) },
      ),
    ).rejects.toBeInstanceOf(AggregateError);

    const flipTimeoutQueue = new InMemoryQueueAdapter<string>();
    await flipTimeoutQueue.add('flip-timeout');
    await expect(
      flipTimeoutQueue.process(
        { process: async (): Promise<void> => undefined },
        { signal: flip('string-reason'), timeoutMs: 50 },
      ),
    ).rejects.toBeInstanceOf(AggregateError);

    const probe = new InMemoryQueueAdapter<string>();
    const abortReason = (
      probe as unknown as { abortReason: (signal: AbortSignal) => Error }
    ).abortReason.bind(probe);
    expect(abortReason({ reason: undefined } as AbortSignal).message).toBe(
      'Job aborted',
    );
    expect(abortReason({ reason: null } as AbortSignal).message).toBe(
      'Job aborted',
    );
    expect(abortReason({ reason: true } as AbortSignal).message).toBe('true');
    expect(abortReason({ reason: 9 } as AbortSignal).message).toBe('9');
    expect(abortReason({ reason: 1n } as AbortSignal).message).toBe('1');
    expect(abortReason({ reason: { code: 42 } } as AbortSignal).message).toBe(
      '{"code":42}',
    );
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(abortReason({ reason: circular } as AbortSignal).message).toBe(
      'Job aborted',
    );

    const eviction = new InMemoryQueueAdapter<string>(undefined, undefined, {
      maxWaiting: 5,
      maxJobs: 2,
    });
    const first = await eviction.add('first');
    await eviction.process({
      process: async (): Promise<void> => undefined,
    });
    expect(await eviction.getStatus(first.id)).toBe('completed');
    const second = await eviction.add('second');
    await eviction
      .process({
        process: async (): Promise<void> => {
          throw new Error('fail');
        },
      })
      .catch(() => undefined);
    expect(await eviction.getStatus(second.id)).toBe('failed');
    const third = await eviction.add('third');
    expect(await eviction.getStatus(first.id)).toBeUndefined();
    expect(await eviction.getStatus(third.id)).toBe('waiting');

    const internals = eviction as unknown as {
      completedOrder: string[];
      jobs: Map<string, unknown>;
      statuses: Map<string, string>;
      evictCompletedIfNeeded: () => void;
    };
    internals.jobs.set('active', { id: 'active' });
    internals.statuses.set('active', 'active');
    internals.completedOrder.push('active');
    internals.evictCompletedIfNeeded();
    expect(internals.jobs.has('active')).toBe(true);
    internals.completedOrder.push('');
    internals.evictCompletedIfNeeded();
  });

  it('rejects in-memory failed-job storage in production', () => {
    const durableAdapter = {
      add: async () => ({
        id: '1',
        payload: null,
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
      }),
      remove: async () => false,
      pause: async () => undefined,
      resume: async () => undefined,
      getStatus: async () => undefined,
      process: async () => undefined,
    };
    expect(() =>
      QueueModule.register({
        isProduction: true,
        adapter: durableAdapter,
        failedJobStorage: new InMemoryFailedJobStorage(),
        metrics: new QueueMetricsCollector(),
      }),
    ).toThrow(/InMemoryFailedJobStorage is not durable/);
  });
});
