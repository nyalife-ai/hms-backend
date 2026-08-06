import { assertPositiveInteger } from '../architecture/production-defaults';
import {
  ScheduledTask,
  SchedulerLock,
  SchedulerMetrics,
  TaskFailure,
} from './contracts';
import { CronParser } from './cron.parser';
import { InMemorySchedulerLock } from './in-memory-scheduler-lock';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface SchedulerTimer {
  setTimeout(callback: () => void, milliseconds: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export type SchedulerClock = () => Date;

export interface SchedulerServiceOptions {
  /** Maximum retained task failures. Defaults to 1_000. */
  readonly maxFailures?: number;
}

interface TaskState {
  readonly task: ScheduledTask;
  timerHandle?: TimerHandle;
  completed: boolean;
}

const defaultTimer: SchedulerTimer = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class SchedulerService {
  private readonly tasks = new Map<string, TaskState>();
  private readonly failures: TaskFailure[] = [];
  private readonly maxFailures: number;
  private running = false;
  private executed = 0;
  private failed = 0;
  private skipped = 0;

  public constructor(
    private readonly lock: SchedulerLock = new InMemorySchedulerLock(),
    private readonly clock: SchedulerClock = () => new Date(),
    private readonly timer: SchedulerTimer = defaultTimer,
    options: SchedulerServiceOptions = {},
  ) {
    this.maxFailures = assertPositiveInteger(
      options.maxFailures ?? 1_000,
      'SchedulerService maxFailures',
    );
  }

  public register(task: ScheduledTask): void {
    this.validateTask(task);
    if (this.tasks.has(task.id)) {
      throw new Error(`Task already registered: ${task.id}`);
    }
    const state: TaskState = { task, completed: false };
    this.tasks.set(task.id, state);
    if (this.running && task.enabled !== false) {
      this.schedule(state);
    }
  }

  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.tasks.forEach((state) => {
      if (!state.completed && state.task.enabled !== false) {
        this.schedule(state);
      }
    });
  }

  public stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.tasks.forEach((state) => {
      if (state.timerHandle !== undefined) {
        this.timer.clearTimeout(state.timerHandle);
        state.timerHandle = undefined;
      }
    });
  }

  public getMetrics(): SchedulerMetrics {
    return Object.freeze({
      executed: this.executed,
      failed: this.failed,
      skipped: this.skipped,
    });
  }

  public getFailures(): readonly TaskFailure[] {
    return this.failures.map((failure) => ({
      ...failure,
      timestamp: new Date(failure.timestamp),
    }));
  }

  private schedule(state: TaskState): void {
    const delay = this.computeDelay(state.task);
    state.timerHandle = this.timer.setTimeout(() => {
      state.timerHandle = undefined;
      void this.runTask(state);
    }, delay);
  }

  private async runTask(state: TaskState): Promise<void> {
    const task = state.task;
    const lockKey = `scheduler:${task.id}`;
    const ttlMs = task.lockTtlMs ?? 30_000;
    const token = await this.lock.acquire(lockKey, ttlMs);
    if (token === undefined) {
      this.skipped += 1;
    } else {
      const renewInterval =
        task.lockRenewIntervalMs ?? Math.max(1, Math.floor(ttlMs / 2));
      let renewHandle: TimerHandle | undefined;
      const stopRenewal = (): void => {
        if (renewHandle !== undefined) {
          this.timer.clearTimeout(renewHandle);
          renewHandle = undefined;
        }
      };
      const scheduleRenewal = (): void => {
        if (!this.lock.renew) {
          return;
        }
        renewHandle = this.timer.setTimeout(() => {
          void this.lock.renew?.(lockKey, token, ttlMs).then((renewed) => {
            if (renewed) {
              scheduleRenewal();
            }
          });
        }, renewInterval);
      };
      scheduleRenewal();
      try {
        await task.handler();
        this.executed += 1;
      } catch (error: unknown) {
        this.failed += 1;
        this.recordFailure({
          taskId: task.id,
          error: this.toError(error),
          timestamp: this.clock(),
        });
      } finally {
        stopRenewal();
        try {
          await this.lock.release(lockKey, token);
        } catch {
          // Best-effort release — never mask the handler outcome.
        }
      }
    }
    if (task.type === 'once') {
      state.completed = true;
    } else if (this.running) {
      this.schedule(state);
    }
  }

  private recordFailure(failure: TaskFailure): void {
    if (this.failures.length >= this.maxFailures) {
      this.failures.shift();
    }
    this.failures.push(failure);
  }

  private computeDelay(task: ScheduledTask): number {
    const now = this.clock();
    if (task.type === 'once') {
      return Math.max(0, (task.runAt as Date).getTime() - now.getTime());
    }
    if (task.type === 'interval') {
      return task.intervalMs as number;
    }
    return (
      new CronParser(task.cron as string).nextRun(now).getTime() - now.getTime()
    );
  }

  private validateTask(task: ScheduledTask): void {
    if (task.id.trim().length === 0) {
      throw new TypeError('Task id cannot be empty');
    }
    if (
      task.lockTtlMs !== undefined &&
      (!Number.isFinite(task.lockTtlMs) || task.lockTtlMs <= 0)
    ) {
      throw new RangeError('Task lock TTL must be positive');
    }
    if (
      task.lockRenewIntervalMs !== undefined &&
      (!Number.isFinite(task.lockRenewIntervalMs) ||
        task.lockRenewIntervalMs <= 0)
    ) {
      throw new RangeError('Task lock renew interval must be positive');
    }
    if (
      task.type === 'interval' &&
      (task.intervalMs === undefined ||
        !Number.isFinite(task.intervalMs) ||
        task.intervalMs <= 0)
    ) {
      throw new RangeError('Interval task requires a positive intervalMs');
    }
    if (
      task.type === 'once' &&
      (task.runAt === undefined || Number.isNaN(task.runAt.getTime()))
    ) {
      throw new RangeError('One-time task requires a valid runAt');
    }
    if (task.type === 'cron') {
      if (task.cron === undefined) {
        throw new SyntaxError('Cron task requires an expression');
      }
      new CronParser(task.cron);
    }
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
