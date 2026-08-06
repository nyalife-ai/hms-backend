import { OtelExporterKind } from '../providers/opentelemetry/exporter.factory';

export type ObservabilityTracerKind = 'noop' | 'memory' | 'otel';
export type ObservabilityLoggerKind = 'json' | 'pino' | 'winston';
export type ObservabilityMetricsKind = 'memory' | 'prometheus' | 'otel';
export type ObservabilityErrorReporterKind =
  'memory' | 'sentry' | 'bugsnag' | 'noop';

export interface ObservabilityOtelConfig {
  readonly enabled: boolean;
  readonly exporter: OtelExporterKind;
  readonly endpoint?: string;
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly autoInstrumentation: boolean;
}

export interface ObservabilityConfig {
  readonly enabled: boolean;
  readonly tracingEnabled: boolean;
  readonly metricsEnabled: boolean;
  readonly loggingEnabled: boolean;
  readonly errorReportingEnabled: boolean;
  readonly profilingEnabled: boolean;
  readonly otel: ObservabilityOtelConfig;
  readonly tracer: ObservabilityTracerKind;
  readonly logger: ObservabilityLoggerKind;
  readonly metrics: ObservabilityMetricsKind;
  readonly errorReporter: ObservabilityErrorReporterKind;
}

export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  enabled: true,
  tracingEnabled: true,
  metricsEnabled: true,
  loggingEnabled: true,
  errorReportingEnabled: true,
  profilingEnabled: true,
  otel: {
    enabled: false,
    exporter: 'console',
    serviceName: 'nyalife-api',
    autoInstrumentation: false,
  },
  tracer: 'memory',
  logger: 'json',
  metrics: 'memory',
  errorReporter: 'memory',
};
