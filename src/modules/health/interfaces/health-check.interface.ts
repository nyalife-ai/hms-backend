export interface IHealthIndicator {
  name: string;
  check(): Promise<HealthIndicatorResult>;
}

export interface HealthIndicatorResult {
  status: 'up' | 'down';
  latency?: number;
  message?: string;
}
