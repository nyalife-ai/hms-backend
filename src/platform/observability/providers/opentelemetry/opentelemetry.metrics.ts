import {
  Counter,
  Gauge,
  Histogram,
  MetricLabels,
  MetricsCollectorLike,
  MetricsSnapshot,
} from '../../metrics/metric.types';
import { MetricsCollector } from '../../metrics/metrics-collector';

export interface OtelCounterLike {
  add(value: number, attributes?: Readonly<Record<string, unknown>>): void;
}
export interface OtelUpDownCounterLike {
  add(value: number, attributes?: Readonly<Record<string, unknown>>): void;
}
export interface OtelHistogramLike {
  record(value: number, attributes?: Readonly<Record<string, unknown>>): void;
}

/** Minimal duck-typed surface of an `@opentelemetry/api` `Meter`. */
export interface OtelMeterLike {
  createCounter(name: string): OtelCounterLike;
  createUpDownCounter(name: string): OtelUpDownCounterLike;
  createHistogram(name: string): OtelHistogramLike;
}

/**
 * Exposes the same counter/gauge/histogram/snapshot/reset surface as
 * {@link MetricsCollector} (composition, not inheritance) while additionally
 * forwarding observations to a real OTEL meter when one is available. Local
 * snapshots always work, even without OTEL installed/configured.
 */
export class OpenTelemetryMetricsCollector implements MetricsCollectorLike {
  private readonly local = new MetricsCollector();
  private readonly otelCounters = new Map<string, OtelCounterLike>();
  private readonly otelGauges = new Map<string, OtelUpDownCounterLike>();
  private readonly otelHistograms = new Map<string, OtelHistogramLike>();

  public constructor(private readonly meter?: OtelMeterLike) {}

  public counter(name: string): Counter {
    const local = this.local.counter(name);
    return {
      inc: (value = 1, labels: MetricLabels = {}): void => {
        local.inc(value, labels);
        this.otelCounter(name).add(value, labels);
      },
    };
  }

  public gauge(name: string): Gauge {
    const local = this.local.gauge(name);
    return {
      set: (value: number, labels: MetricLabels = {}): void => {
        local.set(value, labels);
      },
      inc: (value = 1, labels: MetricLabels = {}): void => {
        local.inc(value, labels);
        this.otelGauge(name).add(value, labels);
      },
      dec: (value = 1, labels: MetricLabels = {}): void => {
        local.dec(value, labels);
        this.otelGauge(name).add(-value, labels);
      },
    };
  }

  public histogram(name: string): Histogram {
    const local = this.local.histogram(name);
    return {
      observe: (value: number, labels: MetricLabels = {}): void => {
        local.observe(value, labels);
        this.otelHistogram(name).record(value, labels);
      },
    };
  }

  public snapshot(): MetricsSnapshot {
    return this.local.snapshot();
  }

  public reset(): void {
    this.local.reset();
    this.otelCounters.clear();
    this.otelGauges.clear();
    this.otelHistograms.clear();
  }

  private otelCounter(name: string): OtelCounterLike {
    return this.cached(this.otelCounters, name, () =>
      this.meter ? this.meter.createCounter(name) : NOOP_ADDABLE,
    );
  }

  private otelGauge(name: string): OtelUpDownCounterLike {
    return this.cached(this.otelGauges, name, () =>
      this.meter ? this.meter.createUpDownCounter(name) : NOOP_ADDABLE,
    );
  }

  private otelHistogram(name: string): OtelHistogramLike {
    return this.cached(this.otelHistograms, name, () =>
      this.meter ? this.meter.createHistogram(name) : NOOP_RECORDABLE,
    );
  }

  private cached<T>(
    registry: Map<string, T>,
    name: string,
    create: () => T,
  ): T {
    const existing = registry.get(name);
    if (existing) {
      return existing;
    }
    const created = create();
    registry.set(name, created);
    return created;
  }
}

const NOOP_ADDABLE: OtelCounterLike & OtelUpDownCounterLike = {
  add: (): void => undefined,
};

const NOOP_RECORDABLE: OtelHistogramLike = {
  record: (): void => undefined,
};
