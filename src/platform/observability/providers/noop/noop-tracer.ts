import {
  Span,
  SpanAttribute,
  SpanContext,
  SpanOptions,
  Tracer,
} from '../../tracing/tracer.interface';

const NOOP_CONTEXT: SpanContext = Object.freeze({
  traceId: 'noop-trace',
  spanId: 'noop-span',
});

class NoopSpan implements Span {
  public readonly context: SpanContext;
  private ended = false;

  public constructor(context: SpanContext) {
    this.context = context;
  }

  public setAttribute(name: string, value: SpanAttribute): this {
    void value;
    this.assertActive();
    if (name.trim().length === 0) {
      throw new Error('Attribute name must not be empty');
    }
    return this;
  }

  public recordException(error: Error): void {
    void error;
    this.assertActive();
  }

  public end(): void {
    this.assertActive();
    this.ended = true;
  }

  private assertActive(): void {
    if (this.ended) {
      throw new Error('Span has already ended');
    }
  }
}

/**
 * Always-on, zero-cost tracer used when tracing is disabled. Spans are
 * created and validated the same way as {@link InMemoryTracer} but nothing
 * is retained, so callers can instrument code unconditionally.
 */
export class NoopTracer implements Tracer {
  public startSpan(name: string, options: SpanOptions = {}): Span {
    if (name.trim().length === 0) {
      throw new Error('Span name must not be empty');
    }
    return new NoopSpan(
      Object.freeze({
        traceId: options.parent?.traceId ?? NOOP_CONTEXT.traceId,
        spanId: NOOP_CONTEXT.spanId,
      }),
    );
  }
}
