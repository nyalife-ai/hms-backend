export type MetricLabels = Readonly<Record<string, string>>;

export interface Counter {
  inc(value?: number, labels?: MetricLabels): void;
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void;
  inc(value?: number, labels?: MetricLabels): void;
  dec(value?: number, labels?: MetricLabels): void;
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
}

export interface MetricPoint {
  readonly labels: MetricLabels;
  readonly value: number;
}

export interface HistogramPoint {
  readonly labels: MetricLabels;
  readonly count: number;
  readonly sum: number;
  readonly buckets: Readonly<Record<string, number>>;
  readonly quantiles: Readonly<Record<string, number>>;
}

export interface MetricsSnapshot {
  readonly counters: Readonly<Record<string, readonly MetricPoint[]>>;
  readonly gauges: Readonly<Record<string, readonly MetricPoint[]>>;
  readonly histograms: Readonly<Record<string, readonly HistogramPoint[]>>;
}

/**
 * Structural (duck-typed) shape of {@link MetricsCollector}'s public API.
 * Alternate backends (Prometheus, OpenTelemetry) compose a `MetricsCollector`
 * internally and expose this same surface rather than extending the class,
 * so callers can depend on this interface instead of a concrete backend.
 */
export interface MetricsCollectorLike {
  counter(name: string): Counter;
  gauge(name: string): Gauge;
  histogram(name: string): Histogram;
  snapshot(): MetricsSnapshot;
  reset(): void;
}
