import { Clock } from '../../../../core';
import { Tracer } from '../../tracing/tracer.interface';
import { InMemoryTracer } from '../../tracing/in-memory-tracer';
import { MissingDriverError, ModuleResolver } from '../load-optional';
import { OtelExporterKind } from './exporter.factory';
import { InstrumentationName } from './instrumentation.loader';
import { OpenTelemetryMetricsCollector } from './opentelemetry.metrics';
import { OpenTelemetryProvider } from './opentelemetry.provider';
import { OpenTelemetryTracer } from './opentelemetry.tracer';

export interface CreateOpenTelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly exporterKind?: OtelExporterKind;
  readonly endpoint?: string;
  readonly instrumentations?: readonly InstrumentationName[];
  readonly resolver?: ModuleResolver;
  /**
   * When `@opentelemetry/api` is not installed: `true` (default) falls back
   * to an in-memory tracer/metrics collector so the app keeps booting;
   * `false` throws {@link MissingDriverError}.
   */
  readonly allowFallback?: boolean;
  readonly clock?: Clock;
}

/** Exported for tests; production callers always go through the factory functions below. */
export const otelSystemClock: Clock = {
  now: (): Date => new Date(),
  timestamp: (): number => Date.now(),
};

/**
 * Builds a {@link Tracer} backed by OpenTelemetry when available. Falls back
 * to {@link InMemoryTracer} (or throws) when the OTEL API package is absent,
 * per {@link CreateOpenTelemetryOptions.allowFallback}.
 */
export function createOpenTelemetryTracer(
  options: CreateOpenTelemetryOptions,
): Tracer {
  const provider = new OpenTelemetryProvider(options);
  const otelTracer = provider.getTracer(options.serviceName);
  if (otelTracer) {
    return new OpenTelemetryTracer(otelTracer);
  }
  if (options.allowFallback === false) {
    throw new MissingDriverError('@opentelemetry/api');
  }
  return new InMemoryTracer(options.clock ?? otelSystemClock);
}

/**
 * Builds an {@link OpenTelemetryMetricsCollector}. Local snapshotting always
 * works; OTEL forwarding activates only when the meter provider is resolved.
 */
export function createOpenTelemetryMetrics(
  options: CreateOpenTelemetryOptions,
): OpenTelemetryMetricsCollector {
  const provider = new OpenTelemetryProvider(options);
  return new OpenTelemetryMetricsCollector(
    provider.getMeter(options.serviceName),
  );
}
