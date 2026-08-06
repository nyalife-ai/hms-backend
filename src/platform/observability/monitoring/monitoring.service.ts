import { assertPositiveInteger } from '../../architecture/production-defaults';
import { Monitor, MonitoringSnapshot } from './monitor.interface';

interface RequestSample {
  readonly timestamp: number;
  readonly latencyMs: number;
  readonly isError: boolean;
}

export interface MonitoringServiceOptions {
  readonly windowMs?: number;
  /** Maximum samples retained in the window. Defaults to 10_000. */
  readonly maxSamples?: number;
  readonly now?: () => number;
}

export class MonitoringService implements Monitor {
  private readonly samples: RequestSample[] = [];
  private readonly windowMs: number;
  private readonly maxSamples: number;
  private readonly now: () => number;

  public constructor(
    windowMsOrOptions: number | MonitoringServiceOptions = 60_000,
    now?: () => number,
  ) {
    if (typeof windowMsOrOptions === 'number') {
      this.windowMs = windowMsOrOptions;
      this.maxSamples = 10_000;
      this.now = now ?? Date.now;
    } else {
      this.windowMs = windowMsOrOptions.windowMs ?? 60_000;
      this.maxSamples = assertPositiveInteger(
        windowMsOrOptions.maxSamples ?? 10_000,
        'MonitoringService maxSamples',
      );
      this.now = windowMsOrOptions.now ?? now ?? Date.now;
    }
    if (!Number.isFinite(this.windowMs) || this.windowMs <= 0) {
      throw new Error('Monitoring window must be positive');
    }
    if (typeof windowMsOrOptions === 'number') {
      this.maxSamples = assertPositiveInteger(
        this.maxSamples,
        'MonitoringService maxSamples',
      );
    }
  }

  public recordRequest(latencyMs: number, statusCode: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      throw new Error('Latency must be a non-negative finite number');
    }
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new Error('Status code must be between 100 and 599');
    }
    this.removeExpired(this.now());
    if (this.samples.length >= this.maxSamples) {
      this.samples.shift();
    }
    this.samples.push({
      timestamp: this.now(),
      latencyMs,
      isError: statusCode >= 500,
    });
  }

  public snapshot(): MonitoringSnapshot {
    const now = this.now();
    this.removeExpired(now);
    if (this.samples.length === 0) {
      return {
        requests: 0,
        errors: 0,
        averageLatencyMs: 0,
        p95LatencyMs: 0,
        errorRate: 0,
        throughputPerSecond: 0,
      };
    }
    const latencies = this.samples
      .map((sample: RequestSample): number => sample.latencyMs)
      .sort((left: number, right: number): number => left - right);
    const errors = this.samples.filter(
      (sample: RequestSample): boolean => sample.isError,
    ).length;
    const totalLatency = latencies.reduce(
      (total: number, latency: number): number => total + latency,
      0,
    );
    const p95Index = Math.ceil(latencies.length * 0.95) - 1;
    return {
      requests: this.samples.length,
      errors,
      averageLatencyMs: totalLatency / this.samples.length,
      p95LatencyMs: latencies[p95Index],
      errorRate: errors / this.samples.length,
      throughputPerSecond: this.samples.length / (this.windowMs / 1_000),
    };
  }

  public reset(): void {
    this.samples.length = 0;
  }

  private removeExpired(now: number): void {
    const firstCurrent = this.samples.findIndex(
      (sample: RequestSample): boolean =>
        sample.timestamp >= now - this.windowMs,
    );
    if (firstCurrent === -1) {
      this.samples.length = 0;
    } else if (firstCurrent > 0) {
      this.samples.splice(0, firstCurrent);
    }
  }
}
