import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_ADAPTER,
  type DatabaseAdapter,
  type DatabaseHealth,
} from '../../../platform/database';

export interface Timer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const systemTimer: Timer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type DatabaseHealthIndicatorResult = Readonly<{
  database: DatabaseHealth;
}>;

@Injectable()
export class DatabaseHealthIndicator {
  public constructor(
    @Inject(DATABASE_ADAPTER) private readonly adapter: DatabaseAdapter,
    private readonly timeoutMs = 5_000,
    private readonly timer: Timer = systemTimer,
  ) {}

  public async check(): Promise<DatabaseHealthIndicatorResult> {
    let handle: unknown;
    const timeout = new Promise<DatabaseHealth>((resolve) => {
      handle = this.timer.set(
        () =>
          resolve({
            status: 'down',
            latencyMs: this.timeoutMs,
            details: { error: 'Database health check timed out' },
          }),
        this.timeoutMs,
      );
    });
    try {
      return {
        database: await Promise.race([this.adapter.healthCheck(), timeout]),
      };
    } finally {
      this.timer.clear(handle);
    }
  }
}
