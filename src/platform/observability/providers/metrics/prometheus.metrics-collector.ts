import { PrometheusFormatter } from '../../dashboard/prometheus-formatter';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsCollectorLike,
  MetricsSnapshot,
} from '../../metrics/metric.types';
import { MetricsCollector } from '../../metrics/metrics-collector';

/**
 * `MetricsCollector` extended with a `toPrometheus()` accessor. Composes the
 * existing collector + formatter rather than duplicating aggregation logic.
 */
export class PrometheusMetricsCollector implements MetricsCollectorLike {
  private readonly delegate: MetricsCollector;
  private readonly formatter: PrometheusFormatter;

  public constructor(
    buckets?: readonly number[],
    formatter: PrometheusFormatter = new PrometheusFormatter(),
  ) {
    this.delegate = new MetricsCollector(buckets);
    this.formatter = formatter;
  }

  public counter(name: string): Counter {
    return this.delegate.counter(name);
  }

  public gauge(name: string): Gauge {
    return this.delegate.gauge(name);
  }

  public histogram(name: string): Histogram {
    return this.delegate.histogram(name);
  }

  public snapshot(): MetricsSnapshot {
    return this.delegate.snapshot();
  }

  public reset(): void {
    this.delegate.reset();
  }

  public toPrometheus(): string {
    return this.formatter.format(this.delegate.snapshot());
  }
}
