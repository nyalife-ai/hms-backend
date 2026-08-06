/**
 * Narrow Prometheus HTTP metrics surface used by HttpMetricsInterceptor.
 *
 * Concrete MetricsService lives in a feature module; common code depends only
 * on this port so the foundation can build without importing business modules.
 *
 * Signatures intentionally align with prom-client Counter/Gauge/Histogram so
 * MetricsService can implement this port without adapters.
 */
export interface LabeledCounter {
  inc(labels?: Partial<Record<string, string | number>>, value?: number): void;
}

export interface LabeledGauge {
  inc(labels?: Partial<Record<string, string | number>>, value?: number): void;
  dec(labels?: Partial<Record<string, string | number>>, value?: number): void;
}

export interface LabeledHistogram {
  observe(
    labels: Partial<Record<string, string | number>>,
    value: number,
  ): void;
}

export interface HttpMetricsPort {
  readonly httpRequestsTotal: LabeledCounter;
  readonly httpRequestDuration: LabeledHistogram;
  readonly httpRequestsInFlight: LabeledGauge;
  readonly httpErrorsTotal: LabeledCounter;
}
