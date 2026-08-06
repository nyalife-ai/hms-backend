import { OtelExporterKind } from '../providers/opentelemetry/exporter.factory';
import {
  DEFAULT_OBSERVABILITY_CONFIG,
  ObservabilityConfig,
  ObservabilityErrorReporterKind,
  ObservabilityLoggerKind,
  ObservabilityMetricsKind,
  ObservabilityTracerKind,
} from './observability.config';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new RangeError(`Invalid boolean env value: ${value}`);
}

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase() as T;
  if (!allowed.includes(normalized)) {
    throw new RangeError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return normalized;
}

const TRACER_KINDS: readonly ObservabilityTracerKind[] = [
  'noop',
  'memory',
  'otel',
];
const LOGGER_KINDS: readonly ObservabilityLoggerKind[] = [
  'json',
  'pino',
  'winston',
];
const METRICS_KINDS: readonly ObservabilityMetricsKind[] = [
  'memory',
  'prometheus',
  'otel',
];
const ERROR_REPORTER_KINDS: readonly ObservabilityErrorReporterKind[] = [
  'memory',
  'sentry',
  'bugsnag',
  'noop',
];
const EXPORTER_KINDS: readonly OtelExporterKind[] = [
  'otlp',
  'jaeger',
  'zipkin',
  'tempo',
  'prometheus',
  'console',
  'noop',
];

/**
 * Resolves observability configuration from process env (or an injected
 * map). Every `*_ENABLED` flag is independent of `OBSERVABILITY_ENABLED`;
 * callers decide how to combine them (see `resolveObservabilityProviders`,
 * which treats a feature as active only when both the master switch and the
 * feature-specific switch are on).
 */
export function resolveObservabilityConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ObservabilityConfig {
  return {
    enabled: parseBoolean(
      env.OBSERVABILITY_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.enabled,
    ),
    tracingEnabled: parseBoolean(
      env.TRACING_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.tracingEnabled,
    ),
    metricsEnabled: parseBoolean(
      env.METRICS_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.metricsEnabled,
    ),
    loggingEnabled: parseBoolean(
      env.LOGGING_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.loggingEnabled,
    ),
    errorReportingEnabled: parseBoolean(
      env.ERROR_REPORTING_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.errorReportingEnabled,
    ),
    profilingEnabled: parseBoolean(
      env.PROFILING_ENABLED,
      DEFAULT_OBSERVABILITY_CONFIG.profilingEnabled,
    ),
    otel: {
      enabled: parseBoolean(
        env.OTEL_ENABLED,
        DEFAULT_OBSERVABILITY_CONFIG.otel.enabled,
      ),
      exporter: parseEnum(
        env.OTEL_EXPORTER,
        EXPORTER_KINDS,
        DEFAULT_OBSERVABILITY_CONFIG.otel.exporter,
        'OTEL_EXPORTER',
      ),
      endpoint: env.OTEL_ENDPOINT?.trim() || undefined,
      serviceName:
        env.OTEL_SERVICE_NAME?.trim() ||
        DEFAULT_OBSERVABILITY_CONFIG.otel.serviceName,
      serviceVersion: env.OTEL_SERVICE_VERSION?.trim() || undefined,
      autoInstrumentation: parseBoolean(
        env.AUTO_INSTRUMENTATION,
        DEFAULT_OBSERVABILITY_CONFIG.otel.autoInstrumentation,
      ),
    },
    tracer: parseEnum(
      env.OBSERVABILITY_TRACER,
      TRACER_KINDS,
      DEFAULT_OBSERVABILITY_CONFIG.tracer,
      'OBSERVABILITY_TRACER',
    ),
    logger: parseEnum(
      env.OBSERVABILITY_LOGGER,
      LOGGER_KINDS,
      DEFAULT_OBSERVABILITY_CONFIG.logger,
      'OBSERVABILITY_LOGGER',
    ),
    metrics: parseEnum(
      env.OBSERVABILITY_METRICS,
      METRICS_KINDS,
      DEFAULT_OBSERVABILITY_CONFIG.metrics,
      'OBSERVABILITY_METRICS',
    ),
    errorReporter: parseEnum(
      env.OBSERVABILITY_ERROR_REPORTER,
      ERROR_REPORTER_KINDS,
      DEFAULT_OBSERVABILITY_CONFIG.errorReporter,
      'OBSERVABILITY_ERROR_REPORTER',
    ),
  };
}
