import { Clock } from '../../../../core';
import { ObservabilityTracerKind } from '../../configuration/observability.config';
import { InMemoryTracer } from '../../tracing/in-memory-tracer';
import { Tracer } from '../../tracing/tracer.interface';
import { ModuleResolver } from '../load-optional';
import { NoopTracer } from '../noop/noop-tracer';
import { OtelExporterKind } from '../opentelemetry/exporter.factory';
import { InstrumentationName } from '../opentelemetry/instrumentation.loader';
import { createOpenTelemetryTracer } from '../opentelemetry/create-opentelemetry';

export interface CreateTracerOtelOptions {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly exporterKind?: OtelExporterKind;
  readonly endpoint?: string;
  readonly instrumentations?: readonly InstrumentationName[];
  readonly allowFallback?: boolean;
  readonly resolver?: ModuleResolver;
}

export interface CreateTracerOptions {
  readonly clock?: Clock;
  readonly otel?: CreateTracerOtelOptions;
}

/** Exported for tests; production callers always go through {@link createTracer}. */
export const systemClock: Clock = {
  now: (): Date => new Date(),
  timestamp: (): number => Date.now(),
};

/** Factory selecting a {@link Tracer} implementation by configured kind. */
export function createTracer(
  kind: ObservabilityTracerKind,
  options: CreateTracerOptions = {},
): Tracer {
  switch (kind) {
    case 'noop':
      return new NoopTracer();
    case 'memory':
      return new InMemoryTracer(options.clock ?? systemClock);
    case 'otel':
      return createOpenTelemetryTracer({
        serviceName: options.otel?.serviceName ?? 'app',
        serviceVersion: options.otel?.serviceVersion,
        environment: options.otel?.environment,
        exporterKind: options.otel?.exporterKind,
        endpoint: options.otel?.endpoint,
        instrumentations: options.otel?.instrumentations,
        allowFallback: options.otel?.allowFallback,
        resolver: options.otel?.resolver,
        clock: options.clock,
      });
    default:
      throw new RangeError(
        `Unknown observability tracer kind: ${String(kind)}`,
      );
  }
}
