import { LogMetadata } from './logger.interface';

export interface LogContextValues {
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly metadata?: LogMetadata;
}

export class LogContext {
  public readonly correlationId?: string;
  public readonly traceId?: string;
  public readonly spanId?: string;
  public readonly metadata: LogMetadata;

  public constructor(values: LogContextValues = {}) {
    this.correlationId = values.correlationId;
    this.traceId = values.traceId;
    this.spanId = values.spanId;
    this.metadata = Object.freeze({ ...(values.metadata ?? {}) });
  }

  public child(values: LogContextValues = {}): LogContext {
    return new LogContext({
      correlationId: values.correlationId ?? this.correlationId,
      traceId: values.traceId ?? this.traceId,
      spanId: values.spanId ?? this.spanId,
      metadata: { ...this.metadata, ...(values.metadata ?? {}) },
    });
  }

  public toObject(): Readonly<Record<string, unknown>> {
    return {
      ...(this.correlationId ? { correlationId: this.correlationId } : {}),
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...(this.spanId ? { spanId: this.spanId } : {}),
      ...this.metadata,
    };
  }
}
