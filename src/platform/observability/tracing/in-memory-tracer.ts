import { assertPositiveInteger } from '../../architecture/production-defaults';
import { Clock, generateId } from '../../../core';
import {
  Span,
  SpanAttribute,
  SpanContext,
  SpanOptions,
  Tracer,
} from './tracer.interface';

export interface RecordedException {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface RecordedSpan {
  readonly name: string;
  readonly context: SpanContext;
  readonly parent?: SpanContext;
  readonly attributes: Readonly<Record<string, SpanAttribute>>;
  readonly exceptions: readonly RecordedException[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
}

export interface InMemoryTracerOptions {
  /** Maximum finished spans retained. Defaults to 1_000. */
  readonly maxSpans?: number;
}

class InMemorySpan implements Span {
  private readonly attributes: Record<string, SpanAttribute>;
  private readonly exceptions: RecordedException[] = [];
  private ended = false;

  public constructor(
    public readonly context: SpanContext,
    private readonly name: string,
    private readonly parent: SpanContext | undefined,
    private readonly startedAt: number,
    initialAttributes: Readonly<Record<string, SpanAttribute>>,
    private readonly clock: Clock,
    private readonly onEnd: (span: RecordedSpan) => void,
  ) {
    this.attributes = { ...initialAttributes };
  }

  public setAttribute(name: string, value: SpanAttribute): this {
    this.assertActive();
    if (name.trim().length === 0) {
      throw new Error('Attribute name must not be empty');
    }
    this.attributes[name] = value;
    return this;
  }

  public recordException(error: Error): void {
    this.assertActive();
    this.exceptions.push({
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  }

  public end(): void {
    this.assertActive();
    this.ended = true;
    const endedAt = this.clock.timestamp();
    this.onEnd(
      Object.freeze({
        name: this.name,
        context: this.context,
        ...(this.parent ? { parent: this.parent } : {}),
        attributes: Object.freeze({ ...this.attributes }),
        exceptions: Object.freeze([...this.exceptions]),
        startedAt: this.startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - this.startedAt),
      }),
    );
  }

  private assertActive(): void {
    if (this.ended) {
      throw new Error('Span has already ended');
    }
  }
}

export class InMemoryTracer implements Tracer {
  private readonly finishedSpans: RecordedSpan[] = [];
  private readonly maxSpans: number;

  public constructor(
    private readonly clock: Clock,
    private readonly createId: (prefix: string) => string = generateId,
    options: InMemoryTracerOptions = {},
  ) {
    this.maxSpans = assertPositiveInteger(
      options.maxSpans ?? 1_000,
      'InMemoryTracer maxSpans',
    );
  }

  public startSpan(name: string, options: SpanOptions = {}): Span {
    if (name.trim().length === 0) {
      throw new Error('Span name must not be empty');
    }
    const context: SpanContext = Object.freeze({
      traceId: options.parent?.traceId ?? this.createId('trace'),
      spanId: this.createId('span'),
    });
    return new InMemorySpan(
      context,
      name,
      options.parent,
      this.clock.timestamp(),
      options.attributes ?? {},
      this.clock,
      (span: RecordedSpan): void => {
        if (this.finishedSpans.length >= this.maxSpans) {
          this.finishedSpans.shift();
        }
        this.finishedSpans.push(span);
      },
    );
  }

  public list(): readonly RecordedSpan[] {
    return Object.freeze([...this.finishedSpans]);
  }

  public clear(): void {
    this.finishedSpans.length = 0;
  }
}
