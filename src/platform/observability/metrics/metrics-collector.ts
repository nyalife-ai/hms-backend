import {
  Counter,
  Gauge,
  Histogram,
  HistogramPoint,
  MetricLabels,
  MetricPoint,
  MetricsSnapshot,
} from './metric.types';

interface ScalarSeries {
  readonly labels: MetricLabels;
  value: number;
}

interface HistogramSeries {
  readonly labels: MetricLabels;
  readonly bucketCounts: number[];
  count: number;
  sum: number;
}

const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Collects counters, gauges, and histograms using incremental bucket/count/sum
 * representation — raw samples are never retained.
 */
export class MetricsCollector {
  private readonly counters = new Map<string, Map<string, ScalarSeries>>();
  private readonly gauges = new Map<string, Map<string, ScalarSeries>>();
  private readonly histograms = new Map<string, Map<string, HistogramSeries>>();
  private readonly buckets: readonly number[];

  public constructor(buckets: readonly number[] = DEFAULT_BUCKETS) {
    if (
      buckets.length === 0 ||
      buckets.some(
        (bucket: number, index: number): boolean =>
          !Number.isFinite(bucket) ||
          bucket <= 0 ||
          (index > 0 && bucket <= buckets[index - 1]),
      )
    ) {
      throw new Error('Histogram buckets must be positive and increasing');
    }
    this.buckets = Object.freeze([...buckets]);
  }

  public counter(name: string): Counter {
    this.validateName(name);
    return {
      inc: (value: number = 1, labels: MetricLabels = {}): void => {
        this.validateValue(value);
        if (value < 0) {
          throw new Error('Counter increment must not be negative');
        }
        this.scalarSeries(this.counters, name, labels).value += value;
      },
    };
  }

  public gauge(name: string): Gauge {
    this.validateName(name);
    return {
      set: (value: number, labels: MetricLabels = {}): void => {
        this.validateValue(value);
        this.scalarSeries(this.gauges, name, labels).value = value;
      },
      inc: (value: number = 1, labels: MetricLabels = {}): void => {
        this.validateValue(value);
        this.scalarSeries(this.gauges, name, labels).value += value;
      },
      dec: (value: number = 1, labels: MetricLabels = {}): void => {
        this.validateValue(value);
        this.scalarSeries(this.gauges, name, labels).value -= value;
      },
    };
  }

  public histogram(name: string): Histogram {
    this.validateName(name);
    return {
      observe: (value: number, labels: MetricLabels = {}): void => {
        this.validateValue(value);
        const series = this.series(this.histograms, name, labels, {
          labels: Object.freeze({ ...labels }),
          bucketCounts: this.buckets.map(() => 0),
          count: 0,
          sum: 0,
        });
        for (let index = 0; index < this.buckets.length; index += 1) {
          if (value <= this.buckets[index]) {
            series.bucketCounts[index] += 1;
          }
        }
        series.count += 1;
        series.sum += value;
      },
    };
  }

  public snapshot(): MetricsSnapshot {
    return Object.freeze({
      counters: this.scalarSnapshot(this.counters),
      gauges: this.scalarSnapshot(this.gauges),
      histograms: this.histogramSnapshot(),
    });
  }

  public reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private scalarSeries(
    registry: Map<string, Map<string, ScalarSeries>>,
    name: string,
    labels: MetricLabels,
  ): ScalarSeries {
    return this.series(registry, name, labels, {
      labels: Object.freeze({ ...labels }),
      value: 0,
    });
  }

  private series<T>(
    registry: Map<string, Map<string, T>>,
    name: string,
    labels: MetricLabels,
    initial: T,
  ): T {
    const key = this.labelKey(labels);
    let named = registry.get(name);
    if (!named) {
      named = new Map<string, T>();
      registry.set(name, named);
    }
    const existing = named.get(key);
    if (existing) {
      return existing;
    }
    named.set(key, initial);
    return initial;
  }

  private scalarSnapshot(
    registry: Map<string, Map<string, ScalarSeries>>,
  ): Readonly<Record<string, readonly MetricPoint[]>> {
    const result: Record<string, readonly MetricPoint[]> = {};
    for (const [name, series] of registry) {
      result[name] = Object.freeze(
        [...series.values()].map((point: ScalarSeries): MetricPoint =>
          Object.freeze({ labels: point.labels, value: point.value }),
        ),
      );
    }
    return Object.freeze(result);
  }

  private histogramSnapshot(): Readonly<
    Record<string, readonly HistogramPoint[]>
  > {
    const result: Record<string, readonly HistogramPoint[]> = {};
    for (const [name, series] of this.histograms) {
      result[name] = Object.freeze(
        [...series.values()].map((point: HistogramSeries): HistogramPoint =>
          this.histogramPoint(point),
        ),
      );
    }
    return Object.freeze(result);
  }

  private histogramPoint(series: HistogramSeries): HistogramPoint {
    const bucketCounts: Record<string, number> = {};
    for (let index = 0; index < this.buckets.length; index += 1) {
      bucketCounts[String(this.buckets[index])] = series.bucketCounts[index];
    }
    bucketCounts['+Inf'] = series.count;
    return Object.freeze({
      labels: series.labels,
      count: series.count,
      sum: series.sum,
      buckets: Object.freeze(bucketCounts),
      quantiles: Object.freeze({
        '0.5': this.estimateQuantile(series, 0.5),
        '0.95': this.estimateQuantile(series, 0.95),
        '0.99': this.estimateQuantile(series, 0.99),
      }),
    });
  }

  /**
   * Prometheus-style linear interpolation across cumulative histogram buckets.
   */
  private estimateQuantile(series: HistogramSeries, quantile: number): number {
    if (series.count === 0) {
      return 0;
    }
    const rank = quantile * series.count;
    let previousCount = 0;
    let previousBound = 0;
    for (let index = 0; index < this.buckets.length; index += 1) {
      const cumulative = series.bucketCounts[index];
      const bound = this.buckets[index];
      if (cumulative >= rank) {
        if (cumulative === previousCount) {
          return bound;
        }
        const fraction = (rank - previousCount) / (cumulative - previousCount);
        return previousBound + fraction * (bound - previousBound);
      }
      previousCount = cumulative;
      previousBound = bound;
    }
    // Past the last finite bucket: use last bucket as lower bound estimate.
    return this.buckets[this.buckets.length - 1];
  }

  private labelKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .sort(([left]: [string, string], [right]: [string, string]): number =>
        left.localeCompare(right),
      )
      .map(([key, value]: [string, string]): string => `${key}=${value}`)
      .join('|');
  }

  private validateName(name: string): void {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
      throw new Error(`Invalid metric name: ${name}`);
    }
  }

  private validateValue(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error('Metric value must be finite');
    }
  }
}
