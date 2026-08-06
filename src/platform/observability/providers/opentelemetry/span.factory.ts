import {
  Span,
  SpanAttribute,
  SpanContext,
} from '../../tracing/tracer.interface';

/** Minimal duck-typed surface of an `@opentelemetry/api` `Span`. */
export interface OtelSpanLike {
  spanContext(): { readonly traceId: string; readonly spanId: string };
  setAttribute(key: string, value: SpanAttribute): unknown;
  recordException(error: Error): void;
  setStatus?(status: {
    readonly code: number;
    readonly message?: string;
  }): void;
  end(): void;
}

/** OTEL `SpanStatusCode.ERROR` (avoids importing `@opentelemetry/api` for one constant). */
const OTEL_STATUS_CODE_ERROR = 2;

/** Adapts a duck-typed OTEL span into the platform {@link Span} contract. */
export class OpenTelemetrySpanAdapter implements Span {
  public readonly context: SpanContext;
  private ended = false;

  public constructor(private readonly delegate: OtelSpanLike) {
    const otelContext = delegate.spanContext();
    this.context = Object.freeze({
      traceId: otelContext.traceId,
      spanId: otelContext.spanId,
    });
  }

  public setAttribute(name: string, value: SpanAttribute): this {
    this.assertActive();
    if (name.trim().length === 0) {
      throw new Error('Attribute name must not be empty');
    }
    this.delegate.setAttribute(name, value);
    return this;
  }

  public recordException(error: Error): void {
    this.assertActive();
    this.delegate.recordException(error);
    this.delegate.setStatus?.({
      code: OTEL_STATUS_CODE_ERROR,
      message: error.message,
    });
  }

  public end(): void {
    this.assertActive();
    this.ended = true;
    this.delegate.end();
  }

  private assertActive(): void {
    if (this.ended) {
      throw new Error('Span has already ended');
    }
  }
}

export function createSpanFromOtel(delegate: OtelSpanLike): Span {
  return new OpenTelemetrySpanAdapter(delegate);
}
