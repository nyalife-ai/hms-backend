import { Injectable } from '@nestjs/common';

export interface TimeoutScheduler {
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}

const scheduler: TimeoutScheduler = {
  schedule: (callback: () => void, milliseconds: number): NodeJS.Timeout =>
    setTimeout(callback, milliseconds),
  cancel: (handle: unknown): void => clearTimeout(handle as NodeJS.Timeout),
};

@Injectable()
export class ActiveRequestTracker {
  private activeCount = 0;
  private readonly drainedWaiters = new Set<() => void>();

  public constructor(private readonly timers: TimeoutScheduler = scheduler) {}

  public get count(): number {
    return this.activeCount;
  }

  public increment(): void {
    this.activeCount += 1;
  }

  public decrement(): void {
    if (this.activeCount === 0) {
      throw new Error('Active request count cannot be negative');
    }
    this.activeCount -= 1;
    if (this.activeCount === 0) {
      const waiters = [...this.drainedWaiters];
      this.drainedWaiters.clear();
      waiters.forEach((waiter: () => void): void => waiter());
    }
  }

  public drain(timeoutMs: number): Promise<boolean> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      return Promise.reject(
        new RangeError('Drain timeout must be a non-negative finite number'),
      );
    }
    if (this.activeCount === 0) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (drained: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.drainedWaiters.delete(onDrained);
        this.timers.cancel(timeoutHandle);
        resolve(drained);
      };
      const onDrained = (): void => finish(true);
      this.drainedWaiters.add(onDrained);
      const timeoutHandle = this.timers.schedule(
        (): void => finish(false),
        timeoutMs,
      );
    });
  }
}
