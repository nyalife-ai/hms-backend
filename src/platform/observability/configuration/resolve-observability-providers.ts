import { Clock } from '../../../core';
import { ErrorReporter } from '../error-tracking/error-reporter.interface';
import { StructuredLogger } from '../logging/logger.interface';
import { LogLevel } from '../logging/structured-logger';
import { MetricsCollectorLike } from '../metrics/metric.types';
import { MetricsCollector } from '../metrics/metrics-collector';
import { Tracer } from '../tracing/tracer.interface';
import { createErrorReporter } from '../providers/error-reporting/create-error-reporter';
import { createLogger } from '../providers/logging/create-logger';
import { ModuleResolver } from '../providers/load-optional';
import { NoopErrorReporter } from '../providers/noop/noop-error-reporter';
import { NoopStructuredLogger } from '../providers/noop/noop-logger';
import { NoopTracer } from '../providers/noop/noop-tracer';
import { ALL_INSTRUMENTATION_NAMES } from '../providers/opentelemetry/instrumentation.loader';
import { createTracer } from '../providers/tracing/create-tracer';
import { createMetrics } from '../providers/metrics/create-metrics';
import { ObservabilityConfig } from './observability.config';

export interface ObservabilityProviderOverrides {
  readonly logger?: StructuredLogger;
  readonly tracer?: Tracer;
  readonly metrics?: MetricsCollector | MetricsCollectorLike;
  readonly errorReporter?: ErrorReporter;
  readonly clock?: Clock;
  readonly minimumLogLevel?: LogLevel;
  readonly sentryDsn?: string;
  readonly bugsnagApiKey?: string;
  readonly resolver?: ModuleResolver;
}

export interface ResolvedObservabilityProviders {
  readonly logger: StructuredLogger;
  readonly tracer: Tracer;
  readonly metrics: MetricsCollector | MetricsCollectorLike;
  readonly errorReporter: ErrorReporter;
}

/**
 * Builds concrete provider instances from resolved config + explicit
 * overrides. An explicit override always wins; otherwise the provider is
 * selected by config kind when the feature (and the observability master
 * switch) are enabled, and a safe noop/in-memory default otherwise.
 */
export function resolveObservabilityProviders(
  config: ObservabilityConfig,
  overrides: ObservabilityProviderOverrides = {},
): ResolvedObservabilityProviders {
  const tracer =
    overrides.tracer ??
    (config.enabled && config.tracingEnabled
      ? createTracer(config.tracer, {
          clock: overrides.clock,
          otel: {
            serviceName: config.otel.serviceName,
            serviceVersion: config.otel.serviceVersion,
            exporterKind: config.otel.exporter,
            endpoint: config.otel.endpoint,
            instrumentations: config.otel.autoInstrumentation
              ? ALL_INSTRUMENTATION_NAMES
              : [],
            resolver: overrides.resolver,
          },
        })
      : new NoopTracer());

  const metrics =
    overrides.metrics ??
    (config.enabled && config.metricsEnabled
      ? createMetrics(config.metrics, {
          otel: {
            serviceName: config.otel.serviceName,
            serviceVersion: config.otel.serviceVersion,
            exporterKind: config.otel.exporter,
            endpoint: config.otel.endpoint,
            instrumentations: config.otel.autoInstrumentation
              ? ALL_INSTRUMENTATION_NAMES
              : [],
            resolver: overrides.resolver,
          },
        })
      : new MetricsCollector());

  const logger =
    overrides.logger ??
    (config.enabled && config.loggingEnabled
      ? createLogger(config.logger, {
          minimumLevel: overrides.minimumLogLevel,
          resolver: overrides.resolver,
        })
      : new NoopStructuredLogger());

  const errorReporter =
    overrides.errorReporter ??
    (config.enabled && config.errorReportingEnabled
      ? createErrorReporter(config.errorReporter, {
          sentryDsn: overrides.sentryDsn,
          bugsnagApiKey: overrides.bugsnagApiKey,
          resolver: overrides.resolver,
        })
      : new NoopErrorReporter());

  return { logger, tracer, metrics, errorReporter };
}
