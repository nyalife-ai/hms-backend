export interface PoolAcquireToken {
  readonly startedAtMilliseconds: number;
}

export interface PoolLeaseToken {
  readonly acquiredAtMilliseconds: number;
}

export interface PoolHooks {
  readonly onAcquireStart?: () => void;
  readonly onAcquire?: (waitMilliseconds: number) => void;
  readonly onAcquireError?: (waitMilliseconds: number) => void;
  readonly onRelease?: (heldMilliseconds: number) => void;
}

export interface PoolMetricsSnapshot {
  readonly active: number;
  readonly pending: number;
  readonly acquired: number;
  readonly released: number;
  readonly acquireErrors: number;
  readonly totalWaitMilliseconds: number;
  readonly maximumWaitMilliseconds: number;
  readonly totalHeldMilliseconds: number;
}

export class PoolMetrics {
  private activeCount = 0;
  private pendingCount = 0;
  private acquiredCount = 0;
  private releasedCount = 0;
  private acquireErrorCount = 0;
  private totalWait = 0;
  private maximumWait = 0;
  private totalHeld = 0;

  public constructor(
    private readonly hooks: PoolHooks = {},
    private readonly now: () => number = Date.now,
  ) {}

  public acquireStarted(): PoolAcquireToken {
    this.pendingCount += 1;
    this.hooks.onAcquireStart?.();
    return { startedAtMilliseconds: this.now() };
  }

  public acquired(token: PoolAcquireToken): PoolLeaseToken {
    const acquiredAt = this.now();
    const wait = Math.max(0, acquiredAt - token.startedAtMilliseconds);
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.activeCount += 1;
    this.acquiredCount += 1;
    this.totalWait += wait;
    this.maximumWait = Math.max(this.maximumWait, wait);
    this.hooks.onAcquire?.(wait);
    return { acquiredAtMilliseconds: acquiredAt };
  }

  public acquireFailed(token: PoolAcquireToken): void {
    const wait = Math.max(0, this.now() - token.startedAtMilliseconds);
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.acquireErrorCount += 1;
    this.totalWait += wait;
    this.maximumWait = Math.max(this.maximumWait, wait);
    this.hooks.onAcquireError?.(wait);
  }

  public released(token: PoolLeaseToken): void {
    const held = Math.max(0, this.now() - token.acquiredAtMilliseconds);
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.releasedCount += 1;
    this.totalHeld += held;
    this.hooks.onRelease?.(held);
  }

  public snapshot(): PoolMetricsSnapshot {
    return {
      active: this.activeCount,
      pending: this.pendingCount,
      acquired: this.acquiredCount,
      released: this.releasedCount,
      acquireErrors: this.acquireErrorCount,
      totalWaitMilliseconds: this.totalWait,
      maximumWaitMilliseconds: this.maximumWait,
      totalHeldMilliseconds: this.totalHeld,
    };
  }

  public reset(): void {
    this.activeCount = 0;
    this.pendingCount = 0;
    this.acquiredCount = 0;
    this.releasedCount = 0;
    this.acquireErrorCount = 0;
    this.totalWait = 0;
    this.maximumWait = 0;
    this.totalHeld = 0;
  }
}
