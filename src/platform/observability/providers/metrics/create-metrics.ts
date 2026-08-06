import { ObservabilityMetricsKind } from '../../configuration/observability.config';
import { MetricsCollectorLike } from '../../metrics/metric.types';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { ModuleResolver } from '../load-optional';
import { OtelExporterKind } from '../opentelemetry/exporter.factory';
import { InstrumentationName } from '../opentelemetry/instrumentation.loader';
import { createOpenTelemetryMetrics } from '../opentelemetry/create-opentelemetry';
import { PrometheusMetricsCollector } from './prometheus.metrics-collector';

export interface CreateMetricsOtelOptions {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly exporterKind?: OtelExporterKind;
  readonly endpoint?: string;
  readonly instrumentations?: readonly InstrumentationName[];
  readonly resolver?: ModuleResolver;
}

export interface CreateMetricsOptions {
  readonly buckets?: readonly number[];
  readonly otel?: CreateMetricsOtelOptions;
}

/** Factory selecting a {@link MetricsCollectorLike} implementation by kind. */
export function createMetrics(
  kind: ObservabilityMetricsKind,
  options: CreateMetricsOptions = {},
): MetricsCollectorLike {
  switch (kind) {
    case 'memory':
      return new MetricsCollector(options.buckets);
    case 'prometheus':
      return new PrometheusMetricsCollector(options.buckets);
    case 'otel':
      return createOpenTelemetryMetrics({
        serviceName: options.otel?.serviceName ?? 'app',
        serviceVersion: options.otel?.serviceVersion,
        environment: options.otel?.environment,
        exporterKind: options.otel?.exporterKind,
        endpoint: options.otel?.endpoint,
        instrumentations: options.otel?.instrumentations,
        resolver: options.otel?.resolver,
      });
    default:
      throw new RangeError(
        `Unknown observability metrics kind: ${String(kind)}`,
      );
  }
}
