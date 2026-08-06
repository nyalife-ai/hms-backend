export interface MonitoringSnapshot {
  readonly requests: number;
  readonly errors: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly errorRate: number;
  readonly throughputPerSecond: number;
}

export interface Monitor {
  recordRequest(latencyMs: number, statusCode: number): void;
  snapshot(): MonitoringSnapshot;
  reset(): void;
}
