export type SpanAttribute = string | number | boolean;

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
}

export interface SpanOptions {
  readonly parent?: SpanContext;
  readonly attributes?: Readonly<Record<string, SpanAttribute>>;
}

export interface Span {
  readonly context: SpanContext;
  setAttribute(name: string, value: SpanAttribute): this;
  recordException(error: Error): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, options?: SpanOptions): Span;
}
