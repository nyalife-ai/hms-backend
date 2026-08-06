export interface QueueMetrics {
  readonly processed: number;
  readonly failed: number;
  readonly avgDurationMs: number;
  readonly depth: number;
  readonly retries: number;
}

export interface QueueMetricsTracker {
  recordProcessed(durationMs: number): void;
  recordFailed(): void;
  recordRetry(): void;
  setDepth(depth: number): void;
  snapshot(): QueueMetrics;
}
