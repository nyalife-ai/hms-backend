export type ScheduleType = 'cron' | 'interval' | 'once';

export interface TaskHandler {
  (): Promise<void>;
}

export interface ScheduledTask {
  readonly id: string;
  readonly type: ScheduleType;
  readonly handler: TaskHandler;
  readonly cron?: string;
  readonly intervalMs?: number;
  readonly runAt?: Date;
  readonly lockTtlMs?: number;
  /**
   * How often to renew the distributed lock while a long job runs.
   * Defaults to half of `lockTtlMs` (minimum 1ms).
   */
  readonly lockRenewIntervalMs?: number;
  readonly enabled?: boolean;
}

export interface SchedulerLock {
  acquire(key: string, ttlMs: number): Promise<string | undefined>;
  release(key: string, token: string): Promise<boolean>;
  /**
   * Extend lock TTL for long-running jobs. Optional for legacy locks;
   * {@link InMemorySchedulerLock} and distributed adapters implement it.
   */
  renew?(key: string, token: string, ttlMs: number): Promise<boolean>;
}

export interface SchedulerMetrics {
  readonly executed: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface TaskFailure {
  readonly taskId: string;
  readonly error: Error;
  readonly timestamp: Date;
}
