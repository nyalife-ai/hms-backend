import { DynamicModule, Module } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
  resolveIsProduction,
} from '../architecture/production-defaults';
import { SchedulerLock } from './contracts';
import { InMemorySchedulerLock } from './in-memory-scheduler-lock';
import {
  SchedulerClock,
  SchedulerService,
  SchedulerServiceOptions,
  SchedulerTimer,
} from './scheduler.service';

export const SCHEDULER_LOCK = Symbol('SCHEDULER_LOCK');

export interface SchedulerModuleOptions
  extends ProductionAwareOptions, SchedulerServiceOptions {
  /**
   * Distributed scheduler lock. Required in production unless `allowInMemory`.
   * Prefer wrapping a reliability Redis lock for multi-instance deployments.
   */
  readonly lock?: SchedulerLock;
  readonly clock?: SchedulerClock;
  readonly timer?: SchedulerTimer;
}

@Module({})
export class SchedulerModule {
  public static register(options: SchedulerModuleOptions = {}): DynamicModule {
    const allowInMemory = allowInMemoryDefaults(options);
    const lock =
      options.lock ?? (allowInMemory ? new InMemorySchedulerLock() : undefined);
    if (!lock) {
      throw new Error(
        'SchedulerModule: distributed lock is required in production (or set allowInMemory: true)',
      );
    }
    if (
      resolveIsProduction(options) &&
      !options.allowInMemory &&
      lock instanceof InMemorySchedulerLock
    ) {
      throw new Error(
        'SchedulerModule: InMemorySchedulerLock is not safe for multi-instance production; provide a distributed lock (or set allowInMemory: true)',
      );
    }
    const scheduler = new SchedulerService(lock, options.clock, options.timer, {
      maxFailures: options.maxFailures,
    });
    return {
      module: SchedulerModule,
      providers: [
        { provide: SCHEDULER_LOCK, useValue: lock },
        { provide: SchedulerService, useValue: scheduler },
      ],
      exports: [SCHEDULER_LOCK, SchedulerService],
    };
  }
}
