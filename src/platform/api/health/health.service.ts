import { type HealthIndicator } from './health-indicator.interface';
import {
  type HealthIndicatorResult,
  type HealthReport,
  type HealthTimer,
} from './health.types';

const defaultTimer: HealthTimer = {
  set: (
    callback: () => void,
    milliseconds: number,
  ): ReturnType<typeof setTimeout> => setTimeout(callback, milliseconds),
  clear: (handle: unknown): void =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class HealthService {
  public constructor(
    private readonly indicators: readonly HealthIndicator[] = [],
    private readonly timeoutMilliseconds = 1_000,
    private readonly timer: HealthTimer = defaultTimer,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
      throw new RangeError('Health timeout must be positive');
    }
  }

  public liveness(): HealthReport {
    return {
      status: 'up',
      timestamp: new Date(this.now()).toISOString(),
      indicators: [],
    };
  }

  public async readiness(): Promise<HealthReport> {
    const indicators = await Promise.all(
      this.indicators.map((indicator) => this.withTimeout(indicator)),
    );
    return {
      status: indicators.every((indicator) => indicator.status === 'up')
        ? 'up'
        : 'down',
      timestamp: new Date(this.now()).toISOString(),
      indicators,
    };
  }

  private async withTimeout(
    indicator: HealthIndicator,
  ): Promise<HealthIndicatorResult> {
    let handle: unknown;
    const timeout = new Promise<HealthIndicatorResult>((resolve) => {
      handle = this.timer.set(
        () =>
          resolve({
            name: indicator.name,
            status: 'down',
            message: `Health check timed out after ${this.timeoutMilliseconds}ms`,
          }),
        this.timeoutMilliseconds,
      );
    });
    try {
      return await Promise.race([
        indicator.check().catch((error: unknown) => ({
          name: indicator.name,
          status: 'down' as const,
          message: error instanceof Error ? error.message : String(error),
        })),
        timeout,
      ]);
    } finally {
      this.timer.clear(handle);
    }
  }
}
