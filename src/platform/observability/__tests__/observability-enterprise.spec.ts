import 'reflect-metadata';
import {
  CallHandler,
  DynamicModule,
  ExecutionContext,
  Provider,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import { Clock } from '../../../core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
import {
  DEFAULT_OBSERVABILITY_CONFIG,
  ObservabilityConfig,
} from '../configuration/observability.config';
import { resolveObservabilityConfig } from '../configuration/resolve-observability-config';
import { resolveObservabilityProviders } from '../configuration/resolve-observability-providers';

// ---------------------------------------------------------------------------
// Providers: load-optional / noop
// ---------------------------------------------------------------------------
import {
  loadDriver,
  MissingDriverError,
  tryLoadDriver,
} from '../providers/load-optional';
import { NoopTracer } from '../providers/noop/noop-tracer';
import { NoopStructuredLogger } from '../providers/noop/noop-logger';
import { NoopErrorReporter } from '../providers/noop/noop-error-reporter';

// ---------------------------------------------------------------------------
// Providers: logging
// ---------------------------------------------------------------------------
import {
  PinoStructuredLogger,
  PinoLoggerLike,
} from '../providers/logging/pino.logger';
import {
  WinstonStructuredLogger,
  WinstonLoggerLike,
  WinstonModuleLike,
} from '../providers/logging/winston.logger';
import { createLogger } from '../providers/logging/create-logger';

// ---------------------------------------------------------------------------
// Providers: tracing
// ---------------------------------------------------------------------------
import {
  createTracer,
  systemClock as tracerSystemClock,
} from '../providers/tracing/create-tracer';

// ---------------------------------------------------------------------------
// Providers: metrics
// ---------------------------------------------------------------------------
import { PrometheusMetricsCollector } from '../providers/metrics/prometheus.metrics-collector';
import { createMetrics } from '../providers/metrics/create-metrics';

// ---------------------------------------------------------------------------
// Providers: error-reporting
// ---------------------------------------------------------------------------
import {
  SentryErrorReporter,
  SentryClientLike,
} from '../providers/error-reporting/sentry.error-reporter';
import {
  BugsnagErrorReporter,
  BugsnagClientLike,
} from '../providers/error-reporting/bugsnag.error-reporter';
import { createErrorReporter } from '../providers/error-reporting/create-error-reporter';

// ---------------------------------------------------------------------------
// Providers: opentelemetry
// ---------------------------------------------------------------------------
import { ResourceBuilder } from '../providers/opentelemetry/resource.builder';
import { createExporter } from '../providers/opentelemetry/exporter.factory';
import {
  ALL_INSTRUMENTATION_NAMES,
  loadInstrumentations,
} from '../providers/opentelemetry/instrumentation.loader';
import {
  createSpanFromOtel,
  OtelSpanLike,
} from '../providers/opentelemetry/span.factory';
import {
  decodeSpanContext,
  encodeSpanContext,
  extractTraceContext,
  injectTraceContext,
  TRACE_CONTEXT_HEADER,
} from '../providers/opentelemetry/context.propagation';
import {
  OpenTelemetryTracer,
  OtelTracerLike,
} from '../providers/opentelemetry/opentelemetry.tracer';
import {
  OpenTelemetryMetricsCollector,
  OtelMeterLike,
} from '../providers/opentelemetry/opentelemetry.metrics';
import { OpenTelemetryProvider } from '../providers/opentelemetry/opentelemetry.provider';
import {
  createOpenTelemetryMetrics,
  createOpenTelemetryTracer,
  otelSystemClock,
} from '../providers/opentelemetry/create-opentelemetry';

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
import {
  OBSERVABILITY_CONFIG,
  OBSERVABILITY_ERROR_REPORTER,
  OBSERVABILITY_LOGGER,
  OBSERVABILITY_METRICS,
  OBSERVABILITY_MONITOR,
  OBSERVABILITY_PROFILER,
  OBSERVABILITY_TRACER,
  ObservabilityModule,
} from '../observability.module';
import { InMemoryTracer } from '../tracing/in-memory-tracer';
import { JsonStructuredLogger } from '../logging/structured-logger';
import { MetricsCollector } from '../metrics/metrics-collector';
import { InMemoryErrorReporter } from '../error-tracking/in-memory-error-reporter';

// ---------------------------------------------------------------------------
// Decorators
// ---------------------------------------------------------------------------
import { Trace, TRACE_METADATA } from '../decorators/trace.decorator';
import { Timed, TIMED_METADATA } from '../decorators/timed.decorator';
import { Metric, METRIC_METADATA } from '../decorators/metric.decorator';
import { Observed } from '../decorators/observed.decorator';

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------
import { TracingInterceptor } from '../interceptors/tracing.interceptor';
import { MetricsInterceptor } from '../interceptors/metrics.interceptor';
import { RequestTimingInterceptor } from '../interceptors/request-timing.interceptor';
import { CorrelationInterceptor } from '../interceptors/correlation.interceptor';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
import { CorrelationMiddleware } from '../middleware/correlation.middleware';
import {
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from '../middleware/request-id.middleware';
import { TraceContextMiddleware } from '../middleware/trace-context.middleware';
import { CORRELATION_ID_HEADER } from '../logging/correlation';
import { LogContext } from '../logging/log-context';

function providerValue(module: DynamicModule, token: unknown): unknown {
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

class FakeClock implements Clock {
  public value = 0;
  public now(): Date {
    return new Date(this.value);
  }
  public timestamp(): number {
    return this.value;
  }
}

describe('load-optional', () => {
  it('loads or throws with actionable messages', () => {
    const value = {};
    expect(loadDriver('driver', () => value)).toBe(value);
    expect(tryLoadDriver('driver', () => value)).toBe(value);
    const missing = (): never => {
      throw new Error('nope');
    };
    expect(tryLoadDriver('driver', missing)).toBeUndefined();
    expect(() => loadDriver('driver', missing)).toThrow(MissingDriverError);
    expect(new MissingDriverError('pkg').message).toContain('yarn add pkg');
    expect(new MissingDriverError('pkg', new Error('x')).cause).toBeInstanceOf(
      Error,
    );
  });

  it('uses the default require-based resolver when none is supplied', async () => {
    const pathModule = await import('node:path');
    expect(loadDriver<typeof pathModule>('path').sep).toBe(pathModule.sep);
    expect(tryLoadDriver<typeof pathModule>('path')).toBeDefined();
    expect(tryLoadDriver('a-package-that-does-not-exist-xyz')).toBeUndefined();
  });
});

describe('noop providers', () => {
  it('NoopTracer validates spans and never retains state', () => {
    const tracer = new NoopTracer();
    expect(() => tracer.startSpan(' ')).toThrow('Span name must not be empty');
    const span = tracer.startSpan('op');
    expect(span.context.traceId).toEqual(expect.any(String));
    expect(() => span.setAttribute(' ', 1)).toThrow();
    expect(span.setAttribute('a', 1)).toBe(span);
    span.recordException(new Error('x'));
    span.end();
    expect(() => span.end()).toThrow('Span has already ended');
    expect(() => span.setAttribute('a', 1)).toThrow();
    expect(() => span.recordException(new Error('x'))).toThrow();

    const parentSpan = tracer.startSpan('parent');
    const child = tracer.startSpan('child', { parent: parentSpan.context });
    expect(child.context.traceId).toBe(parentSpan.context.traceId);
  });

  it('NoopStructuredLogger validates messages and discards everything', () => {
    const logger = new NoopStructuredLogger();
    logger.debug('a');
    logger.info('b', { x: 1 });
    logger.warn('c');
    logger.error('d');
    expect(() => logger.error(' ')).toThrow('Log message must not be empty');
  });

  it('NoopErrorReporter validates input and discards captures', () => {
    const reporter = new NoopErrorReporter();
    expect(reporter.capture(new Error('x'), { a: 1 }, 'high')).toBe('noop');
    expect(() => reporter.capture('bad' as unknown as Error)).toThrow(
      'Only Error instances',
    );
  });
});

describe('opentelemetry: resource builder', () => {
  it('builds resource attributes and validates serviceName', () => {
    const builder = new ResourceBuilder();
    expect(builder.build({ serviceName: 'svc' })).toEqual({
      'service.name': 'svc',
    });
    expect(
      builder.build({
        serviceName: 'svc',
        serviceVersion: '1.0.0',
        environment: 'production',
        attributes: { region: 'eu' },
      }),
    ).toEqual({
      'service.name': 'svc',
      'service.version': '1.0.0',
      'deployment.environment': 'production',
      region: 'eu',
    });
    expect(() => builder.build({ serviceName: ' ' })).toThrow(
      'non-empty serviceName',
    );
  });
});

describe('opentelemetry: exporter factory', () => {
  it('handles noop and console kinds', () => {
    expect(createExporter('noop')).toEqual({ kind: 'noop', available: true });
    expect(createExporter('console').available).toBe(false);
    class ConsoleSpanExporter {}
    const consoleResult = createExporter('console', {
      resolver: () => ({ ConsoleSpanExporter }),
    });
    expect(consoleResult.available).toBe(true);
    expect(consoleResult.exporter).toBeInstanceOf(ConsoleSpanExporter);
  });

  it('resolves named exporter packages and endpoint options', () => {
    class OTLPTraceExporter {
      public constructor(public readonly options?: Record<string, unknown>) {}
    }
    for (const kind of [
      'otlp',
      'jaeger',
      'zipkin',
      'tempo',
      'prometheus',
    ] as const) {
      const result = createExporter(kind, {
        endpoint: 'http://collector:4318',
        resolver: () => ({ OTLPTraceExporter }),
      });
      expect(result.available).toBe(true);
      expect(result.exporter).toBeInstanceOf(OTLPTraceExporter);
      expect((result.exporter as OTLPTraceExporter).options).toEqual({
        url: 'http://collector:4318',
      });
    }
  });

  it('reports unavailable when package missing or has no constructor', () => {
    expect(createExporter('otlp').available).toBe(false);
    const noCtorResult = createExporter('jaeger', {
      resolver: () => ({ notAFunction: 42 }),
    });
    expect(noCtorResult.available).toBe(false);
  });

  it('throws for unknown exporter kinds', () => {
    expect(() => createExporter('bogus' as unknown as 'noop')).toThrow(
      RangeError,
    );
  });
});

describe('opentelemetry: instrumentation loader', () => {
  it('exposes all instrumentation names', () => {
    expect(ALL_INSTRUMENTATION_NAMES).toHaveLength(11);
  });

  it('loads whichever instrumentation packages resolve, skipping the rest', () => {
    class HttpInstrumentation {}
    const loaded = loadInstrumentations(['http', 'redis'], (specifier) =>
      specifier.includes('http') ? { HttpInstrumentation } : { noFn: 1 },
    );
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: 'http' });
    expect(loaded[0].instance).toBeInstanceOf(HttpInstrumentation);
  });

  it('returns an empty list when every package is absent', () => {
    expect(loadInstrumentations(['http', 'kafka'])).toEqual([]);
  });
});

describe('opentelemetry: span factory', () => {
  function fakeOtelSpan(): OtelSpanLike & {
    ended: boolean;
    attributes: Record<string, unknown>;
    exceptions: Error[];
    statuses: Array<{ code: number; message?: string }>;
  } {
    return {
      ended: false,
      attributes: {},
      exceptions: [],
      statuses: [],
      spanContext(): { traceId: string; spanId: string } {
        return { traceId: 'trace-1', spanId: 'span-1' };
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
        return this;
      },
      recordException(error: Error) {
        this.exceptions.push(error);
      },
      end() {
        this.ended = true;
      },
    };
  }

  it('adapts a duck-typed OTEL span', () => {
    const delegate = fakeOtelSpan();
    const span = createSpanFromOtel(delegate);
    expect(span.context).toEqual({ traceId: 'trace-1', spanId: 'span-1' });
    expect(() => span.setAttribute(' ', 1)).toThrow();
    span.setAttribute('key', 'value');
    expect(delegate.attributes.key).toBe('value');
    span.end();
    expect(delegate.ended).toBe(true);
    expect(() => span.end()).toThrow('Span has already ended');
    expect(() => span.setAttribute('a', 1)).toThrow();
  });

  it('records exceptions and forwards status when setStatus is available', () => {
    const delegate = fakeOtelSpan();
    (delegate as OtelSpanLike).setStatus = (status) => {
      delegate.statuses.push(status);
    };
    const span = createSpanFromOtel(delegate);
    span.recordException(new Error('boom'));
    expect(delegate.exceptions).toHaveLength(1);
    expect(delegate.statuses).toEqual([{ code: 2, message: 'boom' }]);
  });

  it('records exceptions without a setStatus implementation', () => {
    const delegate = fakeOtelSpan();
    const span = createSpanFromOtel(delegate);
    expect(() => span.recordException(new Error('boom'))).not.toThrow();
    expect(delegate.exceptions).toHaveLength(1);
    span.end();
    expect(() => span.recordException(new Error('late'))).toThrow(
      'Span has already ended',
    );
  });
});

describe('opentelemetry: context propagation', () => {
  it('encodes and decodes span contexts', () => {
    const context = { traceId: 'trace_abc-123', spanId: 'span_def-456' };
    const encoded = encodeSpanContext(context);
    expect(decodeSpanContext(encoded)).toEqual(context);
    expect(() => encodeSpanContext({ traceId: ' ', spanId: 'x' })).toThrow(
      'non-empty traceId and spanId',
    );
  });

  it('rejects malformed traceparent-style values', () => {
    expect(decodeSpanContext(undefined)).toBeUndefined();
    expect(decodeSpanContext('no-colon')).toBeUndefined();
    expect(decodeSpanContext(':leading')).toBeUndefined();
    expect(decodeSpanContext('trailing:')).toBeUndefined();
  });

  it('injects and extracts context via carriers', () => {
    const context = { traceId: 't1', spanId: 's1' };
    const carrier = injectTraceContext(context);
    expect(carrier[TRACE_CONTEXT_HEADER]).toBe(encodeSpanContext(context));
    expect(extractTraceContext(carrier)).toEqual(context);
    expect(
      extractTraceContext({
        [TRACE_CONTEXT_HEADER]: [carrier[TRACE_CONTEXT_HEADER]],
      }),
    ).toEqual(context);
    expect(extractTraceContext({})).toBeUndefined();
    expect(injectTraceContext(context, { existing: 'x' })).toMatchObject({
      existing: 'x',
    });
  });
});

describe('opentelemetry: tracer adapter', () => {
  it('starts spans through a duck-typed OTEL tracer and validates names', () => {
    const otelSpan: OtelSpanLike = {
      spanContext: () => ({ traceId: 't', spanId: 's' }),
      setAttribute: () => undefined,
      recordException: () => undefined,
      end: () => undefined,
    };
    const startSpan = jest.fn().mockReturnValue(otelSpan);
    const delegate: OtelTracerLike = { startSpan };
    const tracer = new OpenTelemetryTracer(delegate);
    expect(() => tracer.startSpan(' ')).toThrow('Span name must not be empty');
    const span = tracer.startSpan('op', { attributes: { a: 1 } });
    expect(startSpan).toHaveBeenCalledWith('op', { attributes: { a: 1 } });
    expect(span.context).toEqual({ traceId: 't', spanId: 's' });
  });
});

describe('opentelemetry: metrics collector', () => {
  it('always maintains a local snapshot even without a meter', () => {
    const collector = new OpenTelemetryMetricsCollector();
    collector.counter('requests_total').inc();
    collector.gauge('active').set(5);
    collector.gauge('active').inc();
    collector.gauge('active').dec();
    collector.histogram('latency').observe(0.2);
    const snapshot = collector.snapshot();
    expect(snapshot.counters.requests_total).toEqual([
      { labels: {}, value: 1 },
    ]);
    expect(snapshot.gauges.active).toEqual([{ labels: {}, value: 5 }]);
    collector.reset();
    expect(collector.snapshot()).toEqual({
      counters: {},
      gauges: {},
      histograms: {},
    });
  });

  it('forwards observations to a real meter and caches instruments', () => {
    const counterAdd = jest.fn();
    const gaugeAdd = jest.fn();
    const histogramRecord = jest.fn();
    const createCounter = jest.fn().mockReturnValue({ add: counterAdd });
    const createUpDownCounter = jest.fn().mockReturnValue({ add: gaugeAdd });
    const createHistogram = jest
      .fn()
      .mockReturnValue({ record: histogramRecord });
    const meter: OtelMeterLike = {
      createCounter,
      createUpDownCounter,
      createHistogram,
    };
    const collector = new OpenTelemetryMetricsCollector(meter);
    collector.counter('c').inc(2, { a: '1' });
    collector.counter('c').inc(1, { a: '1' });
    collector.gauge('g').inc(1);
    collector.gauge('g').dec(2);
    collector.histogram('h').observe(0.3);
    expect(createCounter).toHaveBeenCalledTimes(1);
    expect(counterAdd).toHaveBeenCalledTimes(2);
    expect(createUpDownCounter).toHaveBeenCalledTimes(1);
    expect(gaugeAdd).toHaveBeenNthCalledWith(2, -2, {});
    expect(createHistogram).toHaveBeenCalledTimes(1);
    expect(histogramRecord).toHaveBeenCalledWith(0.3, {});

    collector.reset();
    collector.counter('c').inc();
    expect(createCounter).toHaveBeenCalledTimes(2);
  });
});

const alwaysMissingResolver = (): never => {
  throw new Error('module not found');
};

describe('opentelemetry: provider', () => {
  it('reports unavailable and returns undefined tracer/meter when API is absent', () => {
    const provider = new OpenTelemetryProvider({
      serviceName: 'svc',
      resolver: alwaysMissingResolver,
    });
    expect(provider.available).toBe(false);
    expect(provider.getTracer('svc')).toBeUndefined();
    expect(provider.getMeter('svc')).toBeUndefined();
    expect(provider.resource['service.name']).toBe('svc');
  });

  it('resolves tracer/meter when the API and metrics API are available', () => {
    const getTracer = jest.fn().mockReturnValue({ startSpan: jest.fn() });
    const getMeter = jest.fn().mockReturnValue({});
    const provider = new OpenTelemetryProvider({
      serviceName: 'svc',
      resolver: (specifier) =>
        specifier === '@opentelemetry/api'
          ? { trace: { getTracer }, metrics: { getMeter } }
          : { noFn: 1 },
    });
    expect(provider.available).toBe(true);
    expect(provider.getTracer('svc')).toBeDefined();
    expect(getTracer).toHaveBeenCalledWith('svc');
    expect(provider.getMeter('svc')).toBeDefined();
    expect(getMeter).toHaveBeenCalledWith('svc');
  });

  it('returns undefined meter when the API has no metrics field', () => {
    const provider = new OpenTelemetryProvider({
      serviceName: 'svc',
      resolver: (specifier) =>
        specifier === '@opentelemetry/api'
          ? { trace: { getTracer: jest.fn() } }
          : { noFn: 1 },
    });
    expect(provider.getMeter('svc')).toBeUndefined();
  });
});

describe('opentelemetry: create-opentelemetry factories', () => {
  it('falls back to InMemoryTracer when OTEL is unavailable and fallback allowed', () => {
    const clock = new FakeClock();
    const tracer = createOpenTelemetryTracer({
      serviceName: 'svc',
      clock,
      resolver: alwaysMissingResolver,
    });
    expect(tracer).toBeInstanceOf(InMemoryTracer);
  });

  it('throws MissingDriverError when fallback disallowed and OTEL unavailable', () => {
    expect(() =>
      createOpenTelemetryTracer({
        serviceName: 'svc',
        allowFallback: false,
        resolver: alwaysMissingResolver,
      }),
    ).toThrow(MissingDriverError);
  });

  it('returns an OpenTelemetryTracer when the API resolves', () => {
    const otelSpan: OtelSpanLike = {
      spanContext: () => ({ traceId: 't', spanId: 's' }),
      setAttribute: () => undefined,
      recordException: () => undefined,
      end: () => undefined,
    };
    const tracer = createOpenTelemetryTracer({
      serviceName: 'svc',
      resolver: (specifier) =>
        specifier === '@opentelemetry/api'
          ? { trace: { getTracer: () => ({ startSpan: () => otelSpan }) } }
          : { noFn: 1 },
    });
    expect(tracer).toBeInstanceOf(OpenTelemetryTracer);
  });

  it('builds metrics collectors with or without a meter', () => {
    const withoutMeter = createOpenTelemetryMetrics({ serviceName: 'svc' });
    expect(withoutMeter).toBeInstanceOf(OpenTelemetryMetricsCollector);
    const withMeter = createOpenTelemetryMetrics({
      serviceName: 'svc',
      resolver: (specifier) =>
        specifier === '@opentelemetry/api'
          ? {
              trace: { getTracer: jest.fn() },
              metrics: { getMeter: () => ({}) },
            }
          : { noFn: 1 },
    });
    expect(withMeter).toBeInstanceOf(OpenTelemetryMetricsCollector);
  });

  it('falls back to the system clock when none is supplied', () => {
    const tracer = createOpenTelemetryTracer({
      serviceName: 'svc',
      resolver: alwaysMissingResolver,
    });
    expect(tracer).toBeInstanceOf(InMemoryTracer);
    expect(otelSystemClock.now()).toBeInstanceOf(Date);
    expect(typeof otelSystemClock.timestamp()).toBe('number');
  });
});

describe('providers/tracing/create-tracer', () => {
  it('creates noop, memory, and otel tracers', () => {
    expect(createTracer('noop')).toBeInstanceOf(NoopTracer);
    const clock = new FakeClock();
    expect(createTracer('memory', { clock })).toBeInstanceOf(InMemoryTracer);
    expect(
      createTracer('otel', {
        clock,
        otel: { serviceName: 'svc', resolver: alwaysMissingResolver },
      }),
    ).toBeInstanceOf(InMemoryTracer);
    expect(createTracer('otel')).toBeDefined();
  });

  it('throws for unknown kinds', () => {
    expect(() => createTracer('bogus' as unknown as 'noop')).toThrow(
      RangeError,
    );
  });

  it('falls back to the system clock when none is supplied', () => {
    const tracer = createTracer('memory');
    const span = tracer.startSpan('op');
    span.end();
    expect(span.context.traceId).toBeDefined();
    expect(tracerSystemClock.now()).toBeInstanceOf(Date);
    expect(typeof tracerSystemClock.timestamp()).toBe('number');
  });
});

describe('providers/metrics', () => {
  it('PrometheusMetricsCollector composes MetricsCollector and formats text', () => {
    const collector = new PrometheusMetricsCollector([1, 5]);
    collector.counter('requests_total').inc(2);
    collector.gauge('active').set(3);
    collector.histogram('latency').observe(0.5);
    const snapshot = collector.snapshot();
    expect(snapshot.counters.requests_total).toEqual([
      { labels: {}, value: 2 },
    ]);
    const text = collector.toPrometheus();
    expect(text).toContain('# TYPE requests_total counter');
    collector.reset();
    expect(collector.snapshot()).toEqual({
      counters: {},
      gauges: {},
      histograms: {},
    });
    expect(new PrometheusMetricsCollector().toPrometheus()).toBe('');
  });

  it('create-metrics selects an implementation by kind', () => {
    expect(createMetrics('memory')).toBeInstanceOf(MetricsCollector);
    expect(createMetrics('prometheus')).toBeInstanceOf(
      PrometheusMetricsCollector,
    );
    expect(
      createMetrics('otel', { otel: { serviceName: 'svc' } }),
    ).toBeInstanceOf(OpenTelemetryMetricsCollector);
    expect(createMetrics('otel')).toBeInstanceOf(OpenTelemetryMetricsCollector);
    expect(() => createMetrics('bogus' as unknown as 'memory')).toThrow(
      RangeError,
    );
  });
});

describe('providers/logging', () => {
  function fakePino(): PinoLoggerLike {
    const entries: Array<{
      payload: Record<string, unknown>;
      message?: string;
    }> = [];
    const instance: PinoLoggerLike = {
      debug: (payload, message) => entries.push({ payload, message }),
      info: (payload, message) => entries.push({ payload, message }),
      warn: (payload, message) => entries.push({ payload, message }),
      error: (payload, message) => entries.push({ payload, message }),
      child: () => fakePino(),
    };
    (instance as unknown as { entries: typeof entries }).entries = entries;
    return instance;
  }

  it('PinoStructuredLogger logs through an injected instance and validates messages', () => {
    const instance = fakePino();
    const logger = new PinoStructuredLogger({ instance });
    logger.info('hello', { a: 1 });
    expect(
      (instance as unknown as { entries: Array<{ message?: string }> })
        .entries[0].message,
    ).toBe('hello');
    logger.debug('dbg');
    logger.warn('warning');
    logger.error('err');
    expect(() => logger.error(' ')).toThrow('Log message must not be empty');
    const child = logger.child(new LogContext({ correlationId: 'c1' }));
    expect(child).toBeInstanceOf(PinoStructuredLogger);
  });

  it('PinoStructuredLogger loads the driver lazily and throws when missing', () => {
    const factory = jest.fn().mockReturnValue(fakePino());
    const logger = new PinoStructuredLogger({
      resolver: () => factory,
      level: 'debug',
    });
    expect(logger).toBeInstanceOf(PinoStructuredLogger);
    expect(factory).toHaveBeenCalledWith({ level: 'debug' });
    expect(
      () =>
        new PinoStructuredLogger({
          resolver: () => {
            throw new Error('nope');
          },
        }),
    ).toThrow(MissingDriverError);
  });

  it('PinoStructuredLogger defaults options to {} when omitted', () => {
    expect(() => new PinoStructuredLogger()).not.toThrow();
  });

  function fakeWinstonModule(logFn: jest.Mock): WinstonModuleLike {
    return {
      createLogger: () => ({
        log: logFn,
        child: () => ({
          log: logFn,
          child: () => ({ log: logFn, child: () => ({}) as WinstonLoggerLike }),
        }),
      }),
      format: {
        combine: (...args) => args,
        json: () => 'json',
        timestamp: () => 'timestamp',
      },
      transports: {
        Console: class {},
      },
    };
  }

  it('WinstonStructuredLogger logs through an injected instance and validates messages', () => {
    const logFn = jest.fn();
    const instance: WinstonLoggerLike = {
      log: logFn,
      child: () => instance,
    };
    const logger = new WinstonStructuredLogger({ instance });
    logger.warn('careful', { code: 1 });
    expect(logFn).toHaveBeenCalledWith('warn', 'careful', { code: 1 });
    logger.debug('dbg');
    logger.info('info');
    logger.error('err');
    expect(() => logger.debug(' ')).toThrow('Log message must not be empty');
    const child = logger.child(new LogContext({ spanId: 's1' }));
    expect(child).toBeInstanceOf(WinstonStructuredLogger);
  });

  it('WinstonStructuredLogger defaults options to {} when omitted', () => {
    expect(() => new WinstonStructuredLogger()).not.toThrow();
  });

  it('WinstonStructuredLogger loads the driver lazily and throws when missing', () => {
    const logFn = jest.fn();
    const logger = new WinstonStructuredLogger({
      resolver: () => fakeWinstonModule(logFn),
    });
    logger.error('boom');
    expect(logFn).toHaveBeenCalledWith('error', 'boom', {});
    expect(
      () =>
        new WinstonStructuredLogger({
          resolver: () => {
            throw new Error('nope');
          },
        }),
    ).toThrow(MissingDriverError);
  });

  it('create-logger selects an implementation by kind', () => {
    expect(createLogger('json')).toBeInstanceOf(JsonStructuredLogger);
    expect(
      createLogger('pino', { resolver: () => () => fakePino() }),
    ).toBeInstanceOf(PinoStructuredLogger);
    expect(
      createLogger('winston', {
        resolver: () => fakeWinstonModule(jest.fn()),
      }),
    ).toBeInstanceOf(WinstonStructuredLogger);
    expect(() => createLogger('bogus' as unknown as 'json')).toThrow(
      RangeError,
    );
  });
});

describe('providers/error-reporting', () => {
  it('SentryErrorReporter falls back to in-memory when unconfigured or package missing', () => {
    const reporter = new SentryErrorReporter();
    const fingerprint = reporter.capture(new Error('boom'));
    expect(fingerprint).toEqual(expect.any(String));

    const withDsnMissingPackage = new SentryErrorReporter({ dsn: 'dsn' });
    expect(withDsnMissingPackage.capture(new Error('x'))).toEqual(
      expect.any(String),
    );
  });

  it('SentryErrorReporter uses a configured client and injected fallback', () => {
    const captureException = jest.fn().mockReturnValue('sentry-id');
    const init = jest.fn();
    const reporter = new SentryErrorReporter({
      dsn: 'dsn',
      resolver: () => ({ init, captureException }),
    });
    expect(init).toHaveBeenCalledWith({ dsn: 'dsn' });
    expect(reporter.capture(new Error('boom'), { a: 1 }, 'critical')).toBe(
      'sentry-id',
    );
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      level: 'critical',
      extra: { a: 1 },
    });

    const client: SentryClientLike = { captureException: () => 'explicit' };
    const explicit = new SentryErrorReporter({ client });
    expect(explicit.capture(new Error('x'))).toBe('explicit');

    const customFallback = new InMemoryErrorReporter();
    const withFallback = new SentryErrorReporter({ fallback: customFallback });
    withFallback.capture(new Error('y'));
    expect(customFallback.list()).toHaveLength(1);

    expect(() => reporter.capture('bad' as unknown as Error)).toThrow(
      'Only Error instances',
    );
  });

  it('BugsnagErrorReporter falls back to in-memory when unconfigured or package missing', () => {
    const reporter = new BugsnagErrorReporter();
    expect(reporter.capture(new Error('boom'))).toEqual(expect.any(String));
    const withKeyMissingPackage = new BugsnagErrorReporter({ apiKey: 'key' });
    expect(withKeyMissingPackage.capture(new Error('x'))).toEqual(
      expect.any(String),
    );
  });

  it('BugsnagErrorReporter notifies a configured client and derives a fingerprint', () => {
    const notify = jest.fn();
    const start = jest.fn().mockReturnValue({ notify });
    const reporter = new BugsnagErrorReporter({
      apiKey: 'key',
      resolver: () => ({ start }),
    });
    expect(start).toHaveBeenCalledWith({ apiKey: 'key' });
    const boom = new Error('boom');
    const fingerprint = reporter.capture(boom, { a: 1 }, 'high');
    expect(notify).toHaveBeenCalledWith(expect.any(Error), {
      severity: 'high',
      metadata: { a: 1 },
    });
    expect(fingerprint).toMatch(/^bugsnag_[0-9a-f]{8}$/);
    expect(reporter.capture(boom)).toBe(fingerprint);

    const client: BugsnagClientLike = { notify: jest.fn() };
    const explicit = new BugsnagErrorReporter({ client });
    expect(explicit.capture(new Error('x'))).toEqual(expect.any(String));

    expect(() => reporter.capture('bad' as unknown as Error)).toThrow(
      'Only Error instances',
    );

    const stacklessError = new Error('stackless');
    stacklessError.stack = undefined;
    expect(reporter.capture(stacklessError)).toMatch(/^bugsnag_[0-9a-f]{8}$/);
  });

  it('create-error-reporter selects an implementation by kind', () => {
    expect(createErrorReporter('memory')).toBeInstanceOf(InMemoryErrorReporter);
    expect(createErrorReporter('noop')).toBeInstanceOf(NoopErrorReporter);
    expect(createErrorReporter('sentry')).toBeInstanceOf(SentryErrorReporter);
    expect(createErrorReporter('bugsnag')).toBeInstanceOf(BugsnagErrorReporter);
    expect(() => createErrorReporter('bogus' as unknown as 'memory')).toThrow(
      RangeError,
    );
  });
});

describe('configuration', () => {
  it('exposes sensible defaults', () => {
    expect(DEFAULT_OBSERVABILITY_CONFIG.tracer).toBe('memory');
    expect(DEFAULT_OBSERVABILITY_CONFIG.otel.enabled).toBe(false);
  });

  it('resolves defaults from an empty env', () => {
    expect(resolveObservabilityConfig({})).toEqual(
      DEFAULT_OBSERVABILITY_CONFIG,
    );
  });

  it('defaults to process.env when no env map is supplied', () => {
    expect(resolveObservabilityConfig()).toMatchObject({
      enabled: expect.any(Boolean),
    });
  });

  it('resolves every field from a fully specified env', () => {
    const config = resolveObservabilityConfig({
      OBSERVABILITY_ENABLED: 'false',
      TRACING_ENABLED: '0',
      METRICS_ENABLED: 'no',
      LOGGING_ENABLED: 'off',
      ERROR_REPORTING_ENABLED: 'yes',
      PROFILING_ENABLED: 'on',
      OTEL_ENABLED: 'true',
      OTEL_EXPORTER: 'OTLP',
      OTEL_ENDPOINT: 'http://collector:4318',
      OTEL_SERVICE_NAME: 'custom-service',
      OTEL_SERVICE_VERSION: '2.0.0',
      AUTO_INSTRUMENTATION: 'true',
      OBSERVABILITY_TRACER: 'OTEL',
      OBSERVABILITY_LOGGER: 'PINO',
      OBSERVABILITY_METRICS: 'PROMETHEUS',
      OBSERVABILITY_ERROR_REPORTER: 'SENTRY',
    });
    expect(config).toEqual<ObservabilityConfig>({
      enabled: false,
      tracingEnabled: false,
      metricsEnabled: false,
      loggingEnabled: false,
      errorReportingEnabled: true,
      profilingEnabled: true,
      otel: {
        enabled: true,
        exporter: 'otlp',
        endpoint: 'http://collector:4318',
        serviceName: 'custom-service',
        serviceVersion: '2.0.0',
        autoInstrumentation: true,
      },
      tracer: 'otel',
      logger: 'pino',
      metrics: 'prometheus',
      errorReporter: 'sentry',
    });
  });

  it('rejects invalid boolean and enum values', () => {
    expect(() =>
      resolveObservabilityConfig({ OBSERVABILITY_ENABLED: 'maybe' }),
    ).toThrow(RangeError);
    expect(() =>
      resolveObservabilityConfig({ OBSERVABILITY_TRACER: 'bogus' }),
    ).toThrow(RangeError);
    expect(() =>
      resolveObservabilityConfig({ OTEL_EXPORTER: 'bogus' }),
    ).toThrow(RangeError);
  });
});

describe('configuration/resolve-observability-providers', () => {
  const baseConfig: ObservabilityConfig = DEFAULT_OBSERVABILITY_CONFIG;

  it('uses explicit overrides when supplied', () => {
    const tracer = new NoopTracer();
    const metrics = new MetricsCollector();
    const logger = new NoopStructuredLogger();
    const errorReporter = new NoopErrorReporter();
    const resolved = resolveObservabilityProviders(baseConfig, {
      tracer,
      metrics,
      logger,
      errorReporter,
    });
    expect(resolved).toEqual({ tracer, metrics, logger, errorReporter });
  });

  it('defaults overrides to {} when omitted', () => {
    const resolved = resolveObservabilityProviders(baseConfig);
    expect(resolved.tracer).toBeInstanceOf(InMemoryTracer);
  });

  it('builds providers from config when the feature is enabled', () => {
    const resolved = resolveObservabilityProviders(
      {
        ...baseConfig,
        otel: { ...baseConfig.otel, autoInstrumentation: true },
      },
      {},
    );
    expect(resolved.tracer).toBeInstanceOf(InMemoryTracer);
    expect(resolved.metrics).toBeInstanceOf(MetricsCollector);
    expect(resolved.logger).toBeInstanceOf(JsonStructuredLogger);
    expect(resolved.errorReporter).toBeInstanceOf(InMemoryErrorReporter);
  });

  it('falls back to noop/in-memory defaults when disabled at the master switch', () => {
    const resolved = resolveObservabilityProviders(
      { ...baseConfig, enabled: false },
      {},
    );
    expect(resolved.tracer).toBeInstanceOf(NoopTracer);
    expect(resolved.metrics).toBeInstanceOf(MetricsCollector);
    expect(resolved.logger).toBeInstanceOf(NoopStructuredLogger);
    expect(resolved.errorReporter).toBeInstanceOf(NoopErrorReporter);
  });

  it('falls back to noop defaults per disabled feature switch', () => {
    const resolved = resolveObservabilityProviders(
      {
        ...baseConfig,
        tracingEnabled: false,
        metricsEnabled: false,
        loggingEnabled: false,
        errorReportingEnabled: false,
      },
      {},
    );
    expect(resolved.tracer).toBeInstanceOf(NoopTracer);
    expect(resolved.metrics).toBeInstanceOf(MetricsCollector);
    expect(resolved.logger).toBeInstanceOf(NoopStructuredLogger);
    expect(resolved.errorReporter).toBeInstanceOf(NoopErrorReporter);
  });
});

describe('ObservabilityModule.forRoot / forRootAsync / registerAsync', () => {
  it('forRoot defaults options to {} and reads process.env when omitted', () => {
    const module = ObservabilityModule.forRoot();
    expect(providerValue(module, OBSERVABILITY_CONFIG)).toBeDefined();
  });

  it('forRoot resolves defaults from env and exposes OBSERVABILITY_CONFIG', () => {
    const module = ObservabilityModule.forRoot({ env: {} });
    expect(providerValue(module, OBSERVABILITY_TRACER)).toBeInstanceOf(
      InMemoryTracer,
    );
    expect(providerValue(module, OBSERVABILITY_METRICS)).toBeInstanceOf(
      MetricsCollector,
    );
    expect(providerValue(module, OBSERVABILITY_LOGGER)).toBeInstanceOf(
      JsonStructuredLogger,
    );
    expect(providerValue(module, OBSERVABILITY_ERROR_REPORTER)).toBeInstanceOf(
      InMemoryErrorReporter,
    );
    expect(providerValue(module, OBSERVABILITY_MONITOR)).toBeDefined();
    expect(providerValue(module, OBSERVABILITY_CONFIG)).toMatchObject({
      enabled: true,
    });
  });

  it('forRoot disables features safely when OBSERVABILITY_ENABLED=false', () => {
    const module = ObservabilityModule.forRoot({
      env: { OBSERVABILITY_ENABLED: 'false' },
    });
    expect(providerValue(module, OBSERVABILITY_TRACER)).toBeInstanceOf(
      NoopTracer,
    );
    expect(providerValue(module, OBSERVABILITY_LOGGER)).toBeInstanceOf(
      NoopStructuredLogger,
    );
    expect(providerValue(module, OBSERVABILITY_ERROR_REPORTER)).toBeInstanceOf(
      NoopErrorReporter,
    );
  });

  it('forRoot honours explicit provider overrides and an explicit config', () => {
    const tracer = new NoopTracer();
    const config = { ...DEFAULT_OBSERVABILITY_CONFIG, tracer: 'noop' as const };
    const module = ObservabilityModule.forRoot({ tracer, config });
    expect(providerValue(module, OBSERVABILITY_TRACER)).toBe(tracer);
    expect(providerValue(module, OBSERVABILITY_CONFIG)).toBe(config);
  });

  it('forRoot still enforces register() production guards', () => {
    expect(() =>
      ObservabilityModule.forRoot({ env: {}, isProduction: true }),
    ).toThrow(/external monitor/);
    expect(() =>
      ObservabilityModule.forRoot({
        env: {},
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();
  });

  it('forRootAsync / registerAsync resolve providers through Nest DI', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [
        ObservabilityModule.forRootAsync<[]>({
          useFactory: async () => ({ env: { OBSERVABILITY_TRACER: 'memory' } }),
        }),
      ],
    }).compile();
    expect(testingModule.get(OBSERVABILITY_TRACER)).toBeInstanceOf(
      InMemoryTracer,
    );
    expect(testingModule.get(OBSERVABILITY_CONFIG)).toMatchObject({
      tracer: 'memory',
    });
    expect(testingModule.get(OBSERVABILITY_PROFILER)).toBeDefined();
    await testingModule.close();

    const aliasModule = await Test.createTestingModule({
      imports: [
        ObservabilityModule.registerAsync<[]>({
          useFactory: () => ({ env: {} }),
        }),
      ],
    }).compile();
    expect(aliasModule.get(OBSERVABILITY_LOGGER)).toBeInstanceOf(
      JsonStructuredLogger,
    );
    await aliasModule.close();
  });

  it('providerValue throws when a token is missing from a resolved module', () => {
    const helper = (
      ObservabilityModule as unknown as {
        providerValue: (module: DynamicModule, token: unknown) => unknown;
      }
    ).providerValue;
    expect(() =>
      helper({ module: ObservabilityModule, providers: [] }, Symbol('missing')),
    ).toThrow(/no resolved provider/);
  });

  it('providerValue and withConfigProvider default missing providers/exports to []', () => {
    const providerValue = (
      ObservabilityModule as unknown as {
        providerValue: (module: DynamicModule, token: unknown) => unknown;
      }
    ).providerValue;
    expect(() =>
      providerValue({ module: ObservabilityModule }, Symbol('missing')),
    ).toThrow(/no resolved provider/);

    const withConfigProvider = (
      ObservabilityModule as unknown as {
        withConfigProvider: (
          module: DynamicModule,
          config: ObservabilityConfig,
        ) => DynamicModule;
      }
    ).withConfigProvider;
    const result = withConfigProvider(
      { module: ObservabilityModule },
      DEFAULT_OBSERVABILITY_CONFIG,
    );
    expect(providerValue(result, OBSERVABILITY_CONFIG)).toBe(
      DEFAULT_OBSERVABILITY_CONFIG,
    );
    expect(result.exports).toContain(OBSERVABILITY_CONFIG);
  });
});

describe('decorators', () => {
  it('Trace sets metadata with defaults and explicit options', () => {
    class Example {
      @Trace()
      public defaultMethod(): void {}

      @Trace({ name: 'custom', attributes: { a: 1 } })
      public customMethod(): void {}
    }
    expect(
      Reflect.getMetadata(TRACE_METADATA, Example.prototype.defaultMethod),
    ).toEqual({});
    expect(
      Reflect.getMetadata(TRACE_METADATA, Example.prototype.customMethod),
    ).toEqual({ name: 'custom', attributes: { a: 1 } });
  });

  it('Timed validates warnThresholdMs', () => {
    class Example {
      @Timed()
      public defaultMethod(): void {}

      @Timed({ warnThresholdMs: 100 })
      public thresholdMethod(): void {}
    }
    expect(
      Reflect.getMetadata(TIMED_METADATA, Example.prototype.defaultMethod),
    ).toEqual({});
    expect(
      Reflect.getMetadata(TIMED_METADATA, Example.prototype.thresholdMethod),
    ).toEqual({ warnThresholdMs: 100 });
    expect(() => Timed({ warnThresholdMs: 0 })).toThrow(RangeError);
    expect(() => Timed({ warnThresholdMs: -5 })).toThrow(RangeError);
  });

  it('Metric validates name and defaults kind to counter', () => {
    class Example {
      @Metric({ name: 'ops_total' })
      public defaultMethod(): void {}

      @Metric({
        name: 'latency_seconds',
        kind: 'histogram',
        labels: { route: 'x' },
      })
      public histogramMethod(): void {}
    }
    expect(
      Reflect.getMetadata(METRIC_METADATA, Example.prototype.defaultMethod),
    ).toEqual({ name: 'ops_total', kind: 'counter' });
    expect(
      Reflect.getMetadata(METRIC_METADATA, Example.prototype.histogramMethod),
    ).toEqual({
      name: 'latency_seconds',
      kind: 'histogram',
      labels: { route: 'x' },
    });
    expect(() => Metric({ name: ' ' })).toThrow(
      'Metric name must not be empty',
    );
  });

  it('Observed composes Trace/Timed/Metric based on options', () => {
    class Example {
      @Observed()
      public defaults(): void {}

      @Observed({ trace: false, timed: false })
      public disabledAll(): void {}

      @Observed({ name: 'op', metric: true })
      public withDefaultMetric(): void {}

      @Observed({ metric: { name: 'custom_metric', kind: 'gauge' } })
      public withCustomMetric(): void {}

      @Observed({ metric: true })
      public withFallbackMetricName(): void {}
    }
    expect(
      Reflect.getMetadata(TRACE_METADATA, Example.prototype.defaults),
    ).toBeDefined();
    expect(
      Reflect.getMetadata(TIMED_METADATA, Example.prototype.defaults),
    ).toBeDefined();
    expect(
      Reflect.getMetadata(METRIC_METADATA, Example.prototype.defaults),
    ).toBeUndefined();

    expect(
      Reflect.getMetadata(TRACE_METADATA, Example.prototype.disabledAll),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(TIMED_METADATA, Example.prototype.disabledAll),
    ).toBeUndefined();

    expect(
      Reflect.getMetadata(METRIC_METADATA, Example.prototype.withDefaultMetric),
    ).toEqual({ name: 'op', kind: 'counter' });

    expect(
      Reflect.getMetadata(METRIC_METADATA, Example.prototype.withCustomMetric),
    ).toEqual({ name: 'custom_metric', kind: 'gauge' });

    expect(
      Reflect.getMetadata(
        METRIC_METADATA,
        Example.prototype.withFallbackMetricName,
      ),
    ).toEqual({ name: 'observed_operations_total', kind: 'counter' });
  });
});

describe('interceptors', () => {
  function fakeContext(
    overrides: Partial<ExecutionContext> = {},
  ): ExecutionContext {
    class Controller {
      public handler(): void {}
    }
    return {
      getHandler: () => Controller.prototype.handler,
      getClass: () => Controller,
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({ setHeader: jest.fn(), statusCode: 200 }),
      }),
      ...overrides,
    } as unknown as ExecutionContext;
  }

  function reflectorReturning(value: unknown): Reflector {
    return { getAllAndOverride: () => value } as unknown as Reflector;
  }

  it('TracingInterceptor is a passthrough without @Trace metadata', async () => {
    const tracer = { startSpan: jest.fn() };
    const interceptor = new TracingInterceptor(
      tracer,
      reflectorReturning(undefined),
    );
    const next: CallHandler = { handle: () => of('value') };
    expect(
      await firstValueFrom(interceptor.intercept(fakeContext(), next)),
    ).toBe('value');
    expect(tracer.startSpan).not.toHaveBeenCalled();
  });

  it('TracingInterceptor starts and ends a span, recording thrown Errors', async () => {
    const span = { end: jest.fn(), recordException: jest.fn() };
    const tracer = { startSpan: jest.fn().mockReturnValue(span) };
    const interceptor = new TracingInterceptor(
      tracer,
      reflectorReturning({ name: 'op' }),
    );
    const next: CallHandler = { handle: () => of('ok') };
    await firstValueFrom(interceptor.intercept(fakeContext(), next));
    expect(tracer.startSpan).toHaveBeenCalledWith('op', {
      attributes: undefined,
    });
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(span.recordException).not.toHaveBeenCalled();

    const failingSpan = { end: jest.fn(), recordException: jest.fn() };
    const failingTracer = { startSpan: jest.fn().mockReturnValue(failingSpan) };
    const failingInterceptor = new TracingInterceptor(
      failingTracer,
      reflectorReturning({}),
    );
    const failingNext: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };
    await expect(
      lastValueFrom(failingInterceptor.intercept(fakeContext(), failingNext)),
    ).rejects.toThrow('boom');
    expect(failingSpan.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(failingSpan.end).toHaveBeenCalledTimes(1);

    const nonErrorSpan = { end: jest.fn(), recordException: jest.fn() };
    const nonErrorTracer = {
      startSpan: jest.fn().mockReturnValue(nonErrorSpan),
    };
    const nonErrorInterceptor = new TracingInterceptor(
      nonErrorTracer,
      reflectorReturning({}),
    );
    await expect(
      lastValueFrom(
        nonErrorInterceptor.intercept(fakeContext(), {
          handle: () => throwError(() => 'not-an-error'),
        }),
      ),
    ).rejects.toBe('not-an-error');
    expect(nonErrorSpan.recordException).not.toHaveBeenCalled();
    expect(nonErrorSpan.end).toHaveBeenCalledTimes(1);
  });

  it('MetricsInterceptor is a passthrough without @Metric metadata', async () => {
    const metrics = {
      counter: jest.fn(),
      gauge: jest.fn(),
      histogram: jest.fn(),
      snapshot: jest.fn(),
      reset: jest.fn(),
    };
    const interceptor = new MetricsInterceptor(
      metrics,
      reflectorReturning(undefined),
    );
    const next: CallHandler = { handle: () => of('value') };
    await firstValueFrom(interceptor.intercept(fakeContext(), next));
    expect(metrics.counter).not.toHaveBeenCalled();
  });

  it('MetricsInterceptor records counter/gauge/histogram outcomes', async () => {
    const inc = jest.fn();
    const observe = jest.fn();
    const metrics = {
      counter: jest.fn().mockReturnValue({ inc }),
      gauge: jest.fn().mockReturnValue({ inc }),
      histogram: jest.fn().mockReturnValue({ observe }),
      snapshot: jest.fn(),
      reset: jest.fn(),
    };

    const counterInterceptor = new MetricsInterceptor(
      metrics,
      reflectorReturning({
        name: 'ops',
        kind: 'counter',
        labels: { route: 'x' },
      }),
    );
    await firstValueFrom(
      counterInterceptor.intercept(fakeContext(), { handle: () => of('ok') }),
    );
    expect(metrics.counter).toHaveBeenCalledWith('ops');
    expect(inc).toHaveBeenCalledWith(1, { route: 'x', status: 'success' });

    const gaugeInterceptor = new MetricsInterceptor(
      metrics,
      reflectorReturning({ name: 'active', kind: 'gauge' }),
    );
    await firstValueFrom(
      gaugeInterceptor.intercept(fakeContext(), { handle: () => of('ok') }),
    );
    expect(metrics.gauge).toHaveBeenCalledWith('active');

    const histogramInterceptor = new MetricsInterceptor(
      metrics,
      reflectorReturning({ name: 'latency', kind: 'histogram' }),
    );
    await firstValueFrom(
      histogramInterceptor.intercept(fakeContext(), { handle: () => of('ok') }),
    );
    expect(observe).toHaveBeenCalledWith(expect.any(Number), {
      status: 'success',
    });

    const errorInterceptor = new MetricsInterceptor(
      metrics,
      reflectorReturning({ name: 'ops', kind: 'counter' }),
    );
    await expect(
      lastValueFrom(
        errorInterceptor.intercept(fakeContext(), {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');
    expect(inc).toHaveBeenCalledWith(1, { status: 'error' });
  });

  it('RequestTimingInterceptor is a passthrough for non-HTTP contexts', async () => {
    const monitor = {
      recordRequest: jest.fn(),
      snapshot: jest.fn(),
      reset: jest.fn(),
    };
    const interceptor = new RequestTimingInterceptor(monitor);
    const context = fakeContext({
      getType: () => 'rpc',
    } as Partial<ExecutionContext>);
    await firstValueFrom(
      interceptor.intercept(context, { handle: () => of('ok') }),
    );
    expect(monitor.recordRequest).not.toHaveBeenCalled();
  });

  it('RequestTimingInterceptor records latency and status for HTTP requests', async () => {
    const monitor = {
      recordRequest: jest.fn(),
      snapshot: jest.fn(),
      reset: jest.fn(),
    };
    const interceptor = new RequestTimingInterceptor(monitor);
    const context = fakeContext({
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as Partial<ExecutionContext>);
    await firstValueFrom(
      interceptor.intercept(context, { handle: () => of('ok') }),
    );
    expect(monitor.recordRequest).toHaveBeenCalledWith(expect.any(Number), 201);

    const failingContext = fakeContext({
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({}),
      }),
    } as Partial<ExecutionContext>);
    await expect(
      lastValueFrom(
        interceptor.intercept(failingContext, {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');
    expect(monitor.recordRequest).toHaveBeenLastCalledWith(
      expect.any(Number),
      500,
    );
  });

  it('RequestTimingInterceptor resolveStatusCode validates status code ranges', () => {
    const monitor = {
      recordRequest: jest.fn(),
      snapshot: jest.fn(),
      reset: jest.fn(),
    };
    const interceptor = new RequestTimingInterceptor(monitor) as unknown as {
      resolveStatusCode: (
        response: { statusCode?: number },
        failed: boolean,
      ) => number;
    };
    expect(interceptor.resolveStatusCode({ statusCode: 404 }, false)).toBe(404);
    expect(interceptor.resolveStatusCode({ statusCode: 200.5 }, false)).toBe(
      200,
    );
    expect(interceptor.resolveStatusCode({ statusCode: 50 }, false)).toBe(200);
    expect(interceptor.resolveStatusCode({ statusCode: 700 }, true)).toBe(500);
    expect(interceptor.resolveStatusCode({}, false)).toBe(200);
    expect(interceptor.resolveStatusCode({}, true)).toBe(500);
  });

  it('CorrelationInterceptor is a passthrough for non-HTTP contexts', async () => {
    const interceptor = new CorrelationInterceptor();
    const context = fakeContext({
      getType: () => 'rpc',
    } as Partial<ExecutionContext>);
    await firstValueFrom(
      interceptor.intercept(context, { handle: () => of('ok') }),
    );
  });

  it('CorrelationInterceptor resolves and echoes a correlation id', async () => {
    const interceptor = new CorrelationInterceptor();
    const setHeader = jest.fn();
    const request: { headers: Record<string, string>; correlationId?: string } =
      {
        headers: { [CORRELATION_ID_HEADER]: 'incoming-id' },
      };
    const context = fakeContext({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as Partial<ExecutionContext>);
    await firstValueFrom(
      interceptor.intercept(context, { handle: () => of('ok') }),
    );
    expect(request.correlationId).toBe('incoming-id');
    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      'incoming-id',
    );
  });
});

describe('middleware', () => {
  it('CorrelationMiddleware resolves and echoes a correlation id', () => {
    const middleware = new CorrelationMiddleware();
    const setHeader = jest.fn();
    const next = jest.fn();
    const request = { headers: {} } as unknown as Parameters<
      CorrelationMiddleware['use']
    >[0];
    middleware.use(request, { setHeader } as never, next);
    expect(request.correlationId).toEqual(expect.any(String));
    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      request.correlationId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('RequestIdMiddleware reuses an incoming header or generates one', () => {
    const middleware = new RequestIdMiddleware();
    const setHeader = jest.fn();
    const next = jest.fn();
    const request = { headers: {} } as unknown as Parameters<
      RequestIdMiddleware['use']
    >[0];
    middleware.use(request, { setHeader } as never, next);
    expect(request.requestId).toEqual(expect.any(String));

    const withHeader = {
      headers: { [REQUEST_ID_HEADER]: ' incoming ' },
    } as unknown as Parameters<RequestIdMiddleware['use']>[0];
    middleware.use(withHeader, { setHeader } as never, next);
    expect(withHeader.requestId).toBe('incoming');

    const withArrayHeader = {
      headers: { [REQUEST_ID_HEADER]: ['first', 'second'] },
    } as unknown as Parameters<RequestIdMiddleware['use']>[0];
    middleware.use(withArrayHeader, { setHeader } as never, next);
    expect(withArrayHeader.requestId).toBe('first');

    const withBlankHeader = {
      headers: { [REQUEST_ID_HEADER]: '   ' },
    } as unknown as Parameters<RequestIdMiddleware['use']>[0];
    middleware.use(withBlankHeader, { setHeader } as never, next);
    expect(withBlankHeader.requestId).toEqual(expect.any(String));

    const deterministic = new RequestIdMiddleware(() => 'fixed-id');
    const withoutHeader = { headers: {} } as unknown as Parameters<
      RequestIdMiddleware['use']
    >[0];
    deterministic.use(withoutHeader, { setHeader } as never, next);
    expect(withoutHeader.requestId).toBe('fixed-id');
    expect(next).toHaveBeenCalledTimes(5);
  });

  it('TraceContextMiddleware starts a root span and ends it on finish', () => {
    const span = {
      context: { traceId: 't1', spanId: 's1' },
      setAttribute: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
    };
    const startSpan = jest.fn().mockReturnValue(span);
    const middleware = new TraceContextMiddleware({ startSpan });
    const setHeader = jest.fn();
    const finishHandlers: Array<() => void> = [];
    const response = {
      setHeader,
      statusCode: 200,
      on: (event: string, handler: () => void) => {
        if (event === 'finish') finishHandlers.push(handler);
      },
    };
    const next = jest.fn();
    const request = {
      method: 'GET',
      path: '/users',
      headers: {},
    } as unknown as Parameters<TraceContextMiddleware['use']>[0];
    middleware.use(request, response as never, next);
    expect(startSpan).toHaveBeenCalledWith('GET /users', {
      parent: undefined,
      attributes: { 'http.method': 'GET' },
    });
    expect(setHeader).toHaveBeenCalledWith(
      TRACE_CONTEXT_HEADER,
      encodeSpanContext(span.context),
    );
    expect(next).toHaveBeenCalledTimes(1);
    finishHandlers.forEach((handler) => handler());
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 200);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('TraceContextMiddleware propagates an incoming trace context and falls back on method/path', () => {
    const span = {
      context: { traceId: 't2', spanId: 's2' },
      setAttribute: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
    };
    const startSpan = jest.fn().mockReturnValue(span);
    const middleware = new TraceContextMiddleware({ startSpan });
    const parentContext = { traceId: 'parent-t', spanId: 'parent-s' };
    const response = {
      setHeader: jest.fn(),
      statusCode: 200,
      on: jest.fn(),
    };
    const request = {
      headers: { [TRACE_CONTEXT_HEADER]: encodeSpanContext(parentContext) },
      url: '/fallback-url',
    } as unknown as Parameters<TraceContextMiddleware['use']>[0];
    middleware.use(request, response as never, jest.fn());
    expect(startSpan).toHaveBeenCalledWith('GET /fallback-url', {
      parent: parentContext,
      attributes: { 'http.method': 'GET' },
    });
  });

  it('TraceContextMiddleware falls back to "/" when neither path nor url are set', () => {
    const span = {
      context: { traceId: 't3', spanId: 's3' },
      setAttribute: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
    };
    const startSpan = jest.fn().mockReturnValue(span);
    const middleware = new TraceContextMiddleware({ startSpan });
    const response = { setHeader: jest.fn(), statusCode: 200, on: jest.fn() };
    const request = { headers: {} } as unknown as Parameters<
      TraceContextMiddleware['use']
    >[0];
    middleware.use(request, response as never, jest.fn());
    expect(startSpan).toHaveBeenCalledWith('GET /', {
      parent: undefined,
      attributes: { 'http.method': 'GET' },
    });
  });
});
