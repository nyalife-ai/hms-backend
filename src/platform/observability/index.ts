export * from './dashboard/metrics-endpoint.contract';
export * from './dashboard/prometheus-formatter';
export * from './error-tracking/error-reporter.interface';
export * from './error-tracking/in-memory-error-reporter';
export * from './logging/correlation';
export * from './logging/log-context';
export * from './logging/logger.interface';
export * from './logging/structured-logger';
export * from './metrics/metric.types';
export * from './metrics/metrics-collector';
export * from './monitoring/monitor.interface';
export * from './monitoring/monitoring.service';
export * from './observability.module';
export type {
  MemorySample,
  ProfileRecord,
  Profiler as ProfilerContract,
} from './profiling/profiler.interface';
export * from './profiling/profiler';
export * from './tracing/in-memory-tracer';
export * from './tracing/tracer.interface';

// Enterprise additions (configuration, optional-driver providers,
// decorators, interceptors, middleware). Everything above this line is the
// original public surface and is untouched.
export * from './configuration/observability.config';
export * from './configuration/resolve-observability-config';
export * from './configuration/resolve-observability-providers';

export * from './providers/load-optional';
export * from './providers/noop/noop-tracer';
export * from './providers/noop/noop-logger';
export * from './providers/noop/noop-error-reporter';
export * from './providers/logging/pino.logger';
export * from './providers/logging/winston.logger';
export * from './providers/logging/create-logger';
export * from './providers/tracing/create-tracer';
export * from './providers/metrics/prometheus.metrics-collector';
export * from './providers/metrics/create-metrics';
export * from './providers/error-reporting/sentry.error-reporter';
export * from './providers/error-reporting/bugsnag.error-reporter';
export * from './providers/error-reporting/create-error-reporter';
export * from './providers/opentelemetry/resource.builder';
export * from './providers/opentelemetry/exporter.factory';
export * from './providers/opentelemetry/instrumentation.loader';
export * from './providers/opentelemetry/span.factory';
export * from './providers/opentelemetry/context.propagation';
export * from './providers/opentelemetry/opentelemetry.provider';
export * from './providers/opentelemetry/opentelemetry.tracer';
export * from './providers/opentelemetry/opentelemetry.metrics';
export * from './providers/opentelemetry/create-opentelemetry';

export * from './decorators/trace.decorator';
export * from './decorators/timed.decorator';
export * from './decorators/metric.decorator';
export * from './decorators/observed.decorator';

export * from './interceptors/tracing.interceptor';
export * from './interceptors/metrics.interceptor';
export * from './interceptors/request-timing.interceptor';
export * from './interceptors/correlation.interceptor';

export * from './middleware/trace-context.middleware';
export * from './middleware/correlation.middleware';
export * from './middleware/request-id.middleware';
