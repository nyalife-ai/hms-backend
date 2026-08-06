import { DynamicModule, Provider } from '@nestjs/common';
import { Clock } from '../../../core';
import { PrometheusFormatter } from '../dashboard/prometheus-formatter';
import { InMemoryErrorReporter } from '../error-tracking/in-memory-error-reporter';
import {
  CORRELATION_ID_HEADER,
  correlationHeaders,
  generateCorrelationId,
  isValidCorrelationId,
  resolveCorrelationId,
} from '../logging/correlation';
import { LogContext } from '../logging/log-context';
import { LogSink } from '../logging/logger.interface';
import {
  ConsoleLogSink,
  JsonStructuredLogger,
} from '../logging/structured-logger';
import { MetricsCollector } from '../metrics/metrics-collector';
import { MonitoringService } from '../monitoring/monitoring.service';
import {
  OBSERVABILITY_ERROR_REPORTER,
  OBSERVABILITY_LOGGER,
  OBSERVABILITY_METRICS,
  OBSERVABILITY_MONITOR,
  OBSERVABILITY_PROFILER,
  OBSERVABILITY_TRACER,
  ObservabilityModule,
} from '../observability.module';
import { Profiler } from '../profiling/profiler';
import { InMemoryTracer } from '../tracing/in-memory-tracer';
import { Span } from '../tracing/tracer.interface';

class CapturingSink implements LogSink {
  public readonly entries: Readonly<Record<string, unknown>>[] = [];

  public write(entry: Readonly<Record<string, unknown>>): void {
    this.entries.push(entry);
  }
}

class FakeClock implements Clock {
  public value = 0;

  public now(): Date {
    return new Date(this.value);
  }

  public timestamp(): number {
    return this.value;
  }
}

function providerValue(module: DynamicModule, token: symbol): unknown {
  const providers = module.providers as Provider[];
  const provider = providers.find(
    (candidate: Provider): boolean =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  if (!provider || typeof provider !== 'object' || !('useValue' in provider)) {
    throw new Error('Value provider not found');
  }
  return provider.useValue;
}

describe('logging and correlation', (): void => {
  it('creates immutable nested contexts and emits every enabled level', (): void => {
    const base = new LogContext({
      correlationId: 'correlation',
      traceId: 'trace',
      spanId: 'span',
      metadata: { service: 'api', shared: 'base' },
    });
    const child = base.child({
      metadata: { shared: 'child' },
    });
    const replaced = child.child({
      correlationId: 'new-correlation',
      traceId: 'new-trace',
      spanId: 'new-span',
    });
    expect(replaced.toObject()).toEqual({
      correlationId: 'new-correlation',
      traceId: 'new-trace',
      spanId: 'new-span',
      service: 'api',
      shared: 'child',
    });
    expect(new LogContext().child().toObject()).toEqual({});

    const sink = new CapturingSink();
    const logger = new JsonStructuredLogger(
      sink,
      child,
      'debug',
      (): string => 'now',
    );
    logger.debug('debug');
    logger.info('info', { request: 1 });
    logger.warn('warn');
    logger.error('error');
    logger.child(new LogContext({ spanId: 'child-span' })).info('child');
    expect(sink.entries).toHaveLength(5);
    expect(sink.entries[1]).toMatchObject({
      timestamp: 'now',
      level: 'info',
      message: 'info',
      correlationId: 'correlation',
      request: 1,
    });
    expect(sink.entries[4]).toMatchObject({
      spanId: 'child-span',
      service: 'api',
    });
  });

  it('filters levels, rejects blank messages, and writes console JSON', (): void => {
    const sink = new CapturingSink();
    const logger = new JsonStructuredLogger(
      sink,
      new LogContext(),
      'warn',
      (): string => 'now',
    );
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('visible');
    expect(sink.entries).toHaveLength(1);
    expect((): void => logger.error(' ')).toThrow(
      'Log message must not be empty',
    );

    const consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((): void => undefined);
    new ConsoleLogSink().write({ level: 'info' });
    new JsonStructuredLogger().info('default');
    expect(consoleSpy).toHaveBeenCalledWith('{"level":"info"}');
    consoleSpy.mockRestore();
  });

  it('generates, accepts, propagates, and validates correlation ids', (): void => {
    expect(generateCorrelationId()).toEqual(expect.any(String));
    expect(resolveCorrelationId(' incoming ')).toBe('incoming');
    expect(resolveCorrelationId(['first', 'second'])).toBe('first');
    expect(resolveCorrelationId(undefined)).toEqual(expect.any(String));
    expect(resolveCorrelationId('  ')).toEqual(expect.any(String));
    expect(resolveCorrelationId('invalid value!')).not.toBe('invalid value!');
    expect(resolveCorrelationId('x'.repeat(129))).not.toBe('x'.repeat(129));
    expect(resolveCorrelationId([])).toEqual(expect.any(String));
    expect(isValidCorrelationId('valid_ID:1.2')).toBe(true);
    expect(isValidCorrelationId('')).toBe(false);
    expect(isValidCorrelationId('x'.repeat(129))).toBe(false);
    expect(correlationHeaders(' id ')).toEqual({
      [CORRELATION_ID_HEADER]: 'id',
    });
    expect((): Readonly<Record<string, string>> =>
      correlationHeaders(' '),
    ).toThrow('invalid length or character');
    expect(() => correlationHeaders('bad value')).toThrow(
      'invalid length or character',
    );
  });
});

describe('monitoring', (): void => {
  it('aggregates latency, errors, percentiles, and window throughput', (): void => {
    let now = 1_000;
    const monitor = new MonitoringService(2_000, (): number => now);
    monitor.recordRequest(10, 200);
    monitor.recordRequest(30, 503);
    monitor.recordRequest(20, 404);
    expect(monitor.snapshot()).toEqual({
      requests: 3,
      errors: 1,
      averageLatencyMs: 20,
      p95LatencyMs: 30,
      errorRate: 1 / 3,
      throughputPerSecond: 1.5,
    });
    now = 3_001;
    expect(monitor.snapshot().requests).toBe(0);
    monitor.recordRequest(5, 200);
    now = 3_500;
    monitor.recordRequest(6, 200);
    now = 5_200;
    expect(monitor.snapshot().requests).toBe(1);
    expect(monitor.snapshot().requests).toBe(1);
    monitor.reset();
    expect(monitor.snapshot().requests).toBe(0);
  });

  it('validates windows and request inputs', (): void => {
    expect((): MonitoringService => new MonitoringService(0)).toThrow();
    expect(
      (): MonitoringService => new MonitoringService(Number.NaN),
    ).toThrow();
    const monitor = new MonitoringService();
    expect((): void => monitor.recordRequest(-1, 200)).toThrow();
    expect((): void =>
      monitor.recordRequest(Number.POSITIVE_INFINITY, 200),
    ).toThrow();
    expect((): void => monitor.recordRequest(1, 99)).toThrow();
    expect((): void => monitor.recordRequest(1, 600)).toThrow();
    expect((): void => monitor.recordRequest(1, 200.5)).toThrow();
  });
});

describe('tracing', (): void => {
  it('records root and nested spans, attributes, errors, and durations', (): void => {
    const clock = new FakeClock();
    let sequence = 0;
    const tracer = new InMemoryTracer(
      clock,
      (prefix: string): string => `${prefix}-${++sequence}`,
    );
    const root = tracer.startSpan('root', { attributes: { initial: true } });
    root.setAttribute('attempt', 1);
    const child = tracer.startSpan('child', { parent: root.context });
    const withStack = new Error('failure');
    child.recordException(withStack);
    const withoutStack = new Error('plain');
    withoutStack.stack = undefined;
    child.recordException(withoutStack);
    clock.value = 10;
    child.end();
    clock.value = -1;
    root.end();
    const spans = tracer.list();
    expect(spans[0]).toMatchObject({
      name: 'child',
      parent: root.context,
      durationMs: 10,
    });
    expect(spans[1]).toMatchObject({
      name: 'root',
      durationMs: 0,
      attributes: { initial: true, attempt: 1 },
    });
    expect(spans[0].exceptions).toHaveLength(2);
    tracer.clear();
    expect(tracer.list()).toEqual([]);
  });

  it('validates span state and supports default options and ids', (): void => {
    const clock = new FakeClock();
    const tracer = new InMemoryTracer(clock);
    expect((): Span => tracer.startSpan(' ')).toThrow(
      'Span name must not be empty',
    );
    const span = tracer.startSpan('default');
    expect((): Span => span.setAttribute(' ', true)).toThrow();
    span.end();
    expect((): void => span.end()).toThrow('Span has already ended');
    expect((): Span => span.setAttribute('late', true)).toThrow();
    expect((): void => span.recordException(new Error('late'))).toThrow();
  });
});

describe('metrics and Prometheus formatting', (): void => {
  it('updates labeled metrics and creates immutable snapshots', (): void => {
    const metrics = new MetricsCollector([1, 5, 10]);
    const counter = metrics.counter('http_requests_total');
    counter.inc();
    counter.inc(2, { method: 'GET', route: '/a' });
    counter.inc(3, { route: '/a', method: 'GET' });
    const gauge = metrics.gauge('active_requests');
    gauge.set(4);
    gauge.inc();
    gauge.inc(2, { worker: 'a' });
    gauge.dec();
    gauge.dec(3, { worker: 'a' });
    const histogram = metrics.histogram('request_duration_seconds');
    histogram.observe(0.5, { route: '/a' });
    histogram.observe(3, { route: '/a' });
    histogram.observe(20, { route: '/a' });
    const snapshot = metrics.snapshot();
    expect(snapshot.counters.http_requests_total).toEqual([
      { labels: {}, value: 1 },
      { labels: { method: 'GET', route: '/a' }, value: 5 },
    ]);
    expect(snapshot.gauges.active_requests).toEqual([
      { labels: {}, value: 4 },
      { labels: { worker: 'a' }, value: -1 },
    ]);
    expect(snapshot.histograms.request_duration_seconds[0]).toMatchObject({
      count: 3,
      sum: 23.5,
      buckets: { '1': 1, '5': 2, '10': 2, '+Inf': 3 },
      // Quantiles are estimated from cumulative buckets (no raw samples).
      quantiles: { '0.5': 3, '0.95': 10, '0.99': 10 },
    });
    metrics.reset();
    expect(metrics.snapshot()).toEqual({
      counters: {},
      gauges: {},
      histograms: {},
    });
  });

  it('validates metric definitions and values', (): void => {
    expect((): MetricsCollector => new MetricsCollector([])).toThrow();
    expect((): MetricsCollector => new MetricsCollector([0])).toThrow();
    expect((): MetricsCollector => new MetricsCollector([2, 1])).toThrow();
    expect(
      (): MetricsCollector => new MetricsCollector([Number.POSITIVE_INFINITY]),
    ).toThrow();
    const metrics = new MetricsCollector();
    expect(() => metrics.counter('bad-name')).toThrow('Invalid metric name');
    expect((): void => metrics.counter('counter').inc(-1)).toThrow();
    expect((): void => metrics.counter('counter').inc(Number.NaN)).toThrow();
    expect((): void =>
      metrics.gauge('gauge').set(Number.POSITIVE_INFINITY),
    ).toThrow();
    expect((): void =>
      metrics.histogram('histogram').observe(Number.NaN),
    ).toThrow();
  });

  it('formats all metric kinds, labels, escaping, and empty snapshots', (): void => {
    const metrics = new MetricsCollector([1]);
    metrics.counter('requests_total').inc(2, {
      path: 'a"b\\c\n',
      method: 'GET',
    });
    metrics.gauge('temperature').set(-2);
    metrics.histogram('latency').observe(2);
    const formatter = new PrometheusFormatter();
    const text = formatter.format(metrics.snapshot());
    expect(text).toContain('# TYPE requests_total counter');
    expect(text).toContain('path="a\\"b\\\\c\\n"');
    expect(text).toContain('# TYPE temperature gauge');
    expect(text).toContain('temperature -2');
    expect(text).toContain('latency_bucket{le="1"} 0');
    expect(text).toContain('latency_bucket{le="+Inf"} 1');
    expect(text).toContain('latency_sum 2');
    expect(text).toContain('latency_count 1');
    expect(text).toContain('latency_quantile{quantile="0.95"} 1');
    expect(formatter.format(new MetricsCollector().snapshot())).toBe('');
  });
});

describe('error reporting', (): void => {
  it('deduplicates reports, merges context, and raises severity', (): void => {
    let now = 1;
    const reporter = new InMemoryErrorReporter((): number => now);
    const error = new Error('boom');
    const fingerprint = reporter.capture(error, { first: true }, 'high');
    now = 2;
    expect(reporter.capture(error, { second: true }, 'low')).toBe(fingerprint);
    now = 3;
    reporter.capture(error, {}, 'critical');
    expect(reporter.list()[0]).toMatchObject({
      fingerprint,
      severity: 'critical',
      context: { first: true, second: true },
      occurrences: 3,
      firstSeenAt: 1,
      lastSeenAt: 3,
    });
    reporter.clear();
    expect(reporter.list()).toEqual([]);
    expect(reporter.capture(new Error('recovered'))).toEqual(
      expect.any(String),
    );
  });

  it('supports errors without stacks and rejects invalid input', (): void => {
    const reporter = new InMemoryErrorReporter();
    const error = new Error('no stack');
    error.stack = undefined;
    reporter.capture(error);
    expect(reporter.list()[0].stack).toBeUndefined();
    expect((): string =>
      reporter.capture('not-error' as unknown as Error),
    ).toThrow('Only Error instances');
  });
});

describe('profiling', (): void => {
  it('measures sync, async, concurrent, failed, and slow operations', async (): Promise<void> => {
    const times = [0, 5, 10, 30, 40, 60, 70, 80];
    let memory = 100;
    const profiler = new Profiler(
      10,
      (): number => times.shift() ?? 80,
      () => ({
        heapUsedBytes: memory++,
        residentSetBytes: 0,
      }),
    );
    await expect(profiler.measure('fast', (): string => 'ok')).resolves.toBe(
      'ok',
    );
    await expect(
      profiler.measure('slow', async (): Promise<string> => 'async'),
    ).resolves.toBe('async');
    await expect(
      Promise.all([
        profiler.measure('one', async (): Promise<number> => 1),
        profiler.measure('two', async (): Promise<number> => 2),
      ]),
    ).resolves.toEqual([1, 2]);
    await expect(
      profiler.measure('failure', (): never => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(profiler.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fast', failed: false, slow: false }),
        expect.objectContaining({ name: 'slow', failed: false, slow: true }),
        expect.objectContaining({ name: 'failure', failed: true }),
      ]),
    );
    expect(profiler.slowOperations().length).toBeGreaterThan(0);
    profiler.clear();
    expect(profiler.list()).toEqual([]);
  });

  it('validates configuration and exercises default samplers', async (): Promise<void> => {
    expect((): Profiler => new Profiler(-1)).toThrow();
    expect((): Profiler => new Profiler(Number.NaN)).toThrow();
    const profiler = new Profiler();
    await expect(profiler.measure('default', (): number => 1)).resolves.toBe(1);
    await expect(profiler.measure(' ', (): number => 1)).rejects.toThrow(
      'Profile name must not be empty',
    );
  });
});

describe('ObservabilityModule', (): void => {
  it('registers default providers', (): void => {
    const module = ObservabilityModule.register();
    expect(module.module).toBe(ObservabilityModule);
    expect(providerValue(module, OBSERVABILITY_LOGGER)).toBeInstanceOf(
      JsonStructuredLogger,
    );
    expect(providerValue(module, OBSERVABILITY_MONITOR)).toBeInstanceOf(
      MonitoringService,
    );
    const tracer = providerValue(module, OBSERVABILITY_TRACER);
    expect(tracer).toBeInstanceOf(InMemoryTracer);
    (
      tracer as {
        readonly clock: Clock;
      }
    ).clock.now();
    const span = (tracer as InMemoryTracer).startSpan('module');
    span.end();
    expect(providerValue(module, OBSERVABILITY_METRICS)).toBeInstanceOf(
      MetricsCollector,
    );
    expect(providerValue(module, OBSERVABILITY_ERROR_REPORTER)).toBeInstanceOf(
      InMemoryErrorReporter,
    );
    expect(providerValue(module, OBSERVABILITY_PROFILER)).toBeInstanceOf(
      Profiler,
    );
    expect(module.exports).toContain(PrometheusFormatter);
  });

  it('uses every custom provider and clock', (): void => {
    const clock = new FakeClock();
    const logger = new JsonStructuredLogger(new CapturingSink());
    const monitor = new MonitoringService();
    const tracer = new InMemoryTracer(clock);
    const metrics = new MetricsCollector();
    const reporter = new InMemoryErrorReporter();
    const profiler = new Profiler();
    const module = ObservabilityModule.register({
      logger,
      monitor,
      tracer,
      metrics,
      errorReporter: reporter,
      profiler,
      clock,
      minimumLogLevel: 'error',
    });
    expect(providerValue(module, OBSERVABILITY_LOGGER)).toBe(logger);
    expect(providerValue(module, OBSERVABILITY_MONITOR)).toBe(monitor);
    expect(providerValue(module, OBSERVABILITY_TRACER)).toBe(tracer);
    expect(providerValue(module, OBSERVABILITY_METRICS)).toBe(metrics);
    expect(providerValue(module, OBSERVABILITY_ERROR_REPORTER)).toBe(reporter);
    expect(providerValue(module, OBSERVABILITY_PROFILER)).toBe(profiler);
  });

  it('requires external observability providers in production', (): void => {
    expect(() => ObservabilityModule.register({ isProduction: true })).toThrow(
      /external monitor/,
    );
    expect(() =>
      ObservabilityModule.register({
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();
    expect(() =>
      ObservabilityModule.register({
        isProduction: true,
        monitor: new MonitoringService(),
        tracer: new InMemoryTracer({
          now: (): Date => new Date(),
          timestamp: (): number => 0,
        }),
        errorReporter: new InMemoryErrorReporter(),
      }),
    ).toThrow(/monitor, tracer, metrics, and errorReporter are required/);
    expect(() => new InMemoryErrorReporter({ maxEntries: 0 })).toThrow(
      RangeError,
    );
    expect(
      () =>
        new InMemoryTracer(
          { now: () => new Date(), timestamp: () => 0 },
          undefined,
          { maxSpans: 0 },
        ),
    ).toThrow(RangeError);
    expect(
      () => new MonitoringService({ windowMs: 1_000, maxSamples: 0 }),
    ).toThrow(RangeError);

    const reporter = new InMemoryErrorReporter({ maxEntries: 1, now: () => 1 });
    reporter.capture(new Error('first'));
    reporter.capture(new Error('second'));
    expect(reporter.list()).toHaveLength(1);
    expect(reporter.list()[0].message).toBe('second');

    const internals = reporter as unknown as {
      insertionOrder: string[];
      reports: Map<string, unknown>;
    };
    internals.insertionOrder.length = 0;
    internals.reports.clear();
    internals.reports.set('stale', {});
    reporter.capture(new Error('after-stale'));
    expect(
      reporter.list().some((entry) => entry.message === 'after-stale'),
    ).toBe(true);
    expect(new InMemoryErrorReporter({}).list()).toEqual([]);
    expect(new InMemoryErrorReporter({ now: (): number => 1 }).list()).toEqual(
      [],
    );

    let now = 0;
    const monitor = new MonitoringService({
      windowMs: 1_000,
      maxSamples: 1,
      now: (): number => now,
    });
    monitor.recordRequest(1, 200);
    now = 10;
    monitor.recordRequest(2, 200);
    expect(monitor.snapshot().requests).toBe(1);
    expect(new MonitoringService({ maxSamples: 3 }).snapshot().requests).toBe(
      0,
    );
    expect(new MonitoringService({ windowMs: 500 }).snapshot().requests).toBe(
      0,
    );

    const tracer = new InMemoryTracer(
      { now: (): Date => new Date(), timestamp: (): number => 1 },
      undefined,
      { maxSpans: 1 },
    );
    tracer.startSpan('one').end();
    tracer.startSpan('two').end();
    expect(tracer.list()).toHaveLength(1);
    expect(tracer.list()[0].name).toBe('two');

    const metrics = new MetricsCollector([1, 5, 10]);
    const estimate = (
      metrics as unknown as {
        estimateQuantile: (
          series: {
            labels: Record<string, string>;
            bucketCounts: number[];
            count: number;
            sum: number;
          },
          quantile: number,
        ) => number;
      }
    ).estimateQuantile.bind(metrics);
    expect(
      estimate({ labels: {}, bucketCounts: [0, 0, 0], count: 0, sum: 0 }, 0.5),
    ).toBe(0);
    expect(
      estimate({ labels: {}, bucketCounts: [0, 1, 2], count: 2, sum: 3 }, 0),
    ).toBe(1);
  });
});
