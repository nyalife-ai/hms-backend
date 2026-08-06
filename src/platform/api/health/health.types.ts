export type HealthStatus = 'up' | 'down';

export interface HealthIndicatorResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly durationMs?: number;
}

export interface HealthReport {
  readonly status: HealthStatus;
  readonly timestamp: string;
  readonly indicators: readonly HealthIndicatorResult[];
}

export interface HealthTimer {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
