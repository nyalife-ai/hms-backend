import { Span, SpanOptions, Tracer } from '../../tracing/tracer.interface';
import { createSpanFromOtel, OtelSpanLike } from './span.factory';

/** Minimal duck-typed surface of an `@opentelemetry/api` `Tracer`. */
export interface OtelTracerLike {
  startSpan(
    name: string,
    options?: { readonly attributes?: Readonly<Record<string, unknown>> },
    context?: unknown,
  ): OtelSpanLike;
}

/**
 * Adapts a real (or fake, in tests) OTEL tracer to the platform {@link Tracer}
 * contract. Business code depends on `Tracer`/`Span`, never on
 * `@opentelemetry/api` types directly.
 */
export class OpenTelemetryTracer implements Tracer {
  public constructor(private readonly delegate: OtelTracerLike) {}

  public startSpan(name: string, options: SpanOptions = {}): Span {
    if (name.trim().length === 0) {
      throw new Error('Span name must not be empty');
    }
    const otelSpan = this.delegate.startSpan(name, {
      attributes: options.attributes,
    });
    return createSpanFromOtel(otelSpan);
  }
}
