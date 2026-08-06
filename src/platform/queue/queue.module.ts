import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
  resolveIsProduction,
} from '../architecture/production-defaults';
import { QueueAdapter } from './contracts/queue-adapter.interface';
import {
  FAILED_JOB_STORAGE,
  QUEUE_ADAPTER,
  QUEUE_METRICS,
} from './contracts/queue.tokens';
import { DeadLetterService } from './dead-letter/dead-letter.service';
import { FailedJobStorage } from './dead-letter/failed-job-storage.interface';
import { InMemoryFailedJobStorage } from './dead-letter/in-memory-failed-job.storage';
import { QueueMetricsTracker } from './monitoring/queue-metrics.interface';
import { QueueMetricsCollector } from './monitoring/queue-metrics.collector';
import { InMemoryQueueAdapter } from './providers/in-memory-queue.adapter';
import { JobFactory } from './providers/job.factory';
import { RetryExecutor } from './retry/retry-executor';
import { JobScheduler } from './scheduling/job-scheduler';

export interface QueueModuleOptions extends ProductionAwareOptions {
  /**
   * Queue adapter. Required in production unless `allowInMemory`.
   * Prefer a durable backend; {@link InMemoryQueueAdapter} is not durable.
   */
  readonly adapter?: QueueAdapter<unknown>;
  /** Failed-job storage. Required in production unless `allowInMemory`. */
  readonly failedJobStorage?: FailedJobStorage;
  /** Metrics backend. Required in production unless `allowInMemory`. */
  readonly metrics?: QueueMetricsTracker;
}

@Module({})
export class QueueModule {
  public static register(options: QueueModuleOptions = {}): DynamicModule {
    const allowInMemory = allowInMemoryDefaults(options);
    const jobFactory = new JobFactory();
    const adapter =
      options.adapter ??
      (allowInMemory
        ? new InMemoryQueueAdapter<unknown>(jobFactory)
        : undefined);
    const storage =
      options.failedJobStorage ??
      (allowInMemory ? new InMemoryFailedJobStorage() : undefined);
    const metrics =
      options.metrics ??
      (allowInMemory ? new QueueMetricsCollector() : undefined);

    if (!adapter) {
      throw new Error(
        'QueueModule: durable adapter is required in production (or set allowInMemory: true)',
      );
    }
    if (!storage) {
      throw new Error(
        'QueueModule: failedJobStorage is required in production (or set allowInMemory: true)',
      );
    }
    if (!metrics) {
      throw new Error(
        'QueueModule: metrics backend is required in production (or set allowInMemory: true)',
      );
    }
    if (
      resolveIsProduction(options) &&
      !options.allowInMemory &&
      adapter instanceof InMemoryQueueAdapter
    ) {
      throw new Error(
        'QueueModule: InMemoryQueueAdapter is not durable; provide a durable adapter (or set allowInMemory: true)',
      );
    }
    if (
      resolveIsProduction(options) &&
      !options.allowInMemory &&
      storage instanceof InMemoryFailedJobStorage
    ) {
      throw new Error(
        'QueueModule: InMemoryFailedJobStorage is not durable; provide durable failed-job storage (or set allowInMemory: true)',
      );
    }

    const providers: Provider[] = [
      { provide: JobFactory, useValue: jobFactory },
      { provide: QUEUE_ADAPTER, useValue: adapter },
      { provide: FAILED_JOB_STORAGE, useValue: storage },
      { provide: QUEUE_METRICS, useValue: metrics },
      {
        provide: DeadLetterService,
        useFactory: (failedStorage: FailedJobStorage): DeadLetterService =>
          new DeadLetterService(failedStorage),
        inject: [FAILED_JOB_STORAGE],
      },
      { provide: RetryExecutor, useValue: new RetryExecutor() },
      {
        provide: JobScheduler,
        useFactory: (queue: QueueAdapter<unknown>): JobScheduler<unknown> =>
          new JobScheduler(queue),
        inject: [QUEUE_ADAPTER],
      },
    ];
    return {
      module: QueueModule,
      providers,
      exports: [
        QUEUE_ADAPTER,
        FAILED_JOB_STORAGE,
        QUEUE_METRICS,
        JobFactory,
        DeadLetterService,
        RetryExecutor,
        JobScheduler,
      ],
    };
  }
}
