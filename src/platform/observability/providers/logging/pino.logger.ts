import { LogContext } from '../../logging/log-context';
import { LogMetadata, StructuredLogger } from '../../logging/logger.interface';
import { LogLevel } from '../../logging/structured-logger';
import { loadDriver, ModuleResolver } from '../load-optional';

/** Minimal duck-typed surface of a `pino` logger instance. */
export interface PinoLoggerLike {
  debug(payload: Record<string, unknown>, message?: string): void;
  info(payload: Record<string, unknown>, message?: string): void;
  warn(payload: Record<string, unknown>, message?: string): void;
  error(payload: Record<string, unknown>, message?: string): void;
  child(bindings: Record<string, unknown>): PinoLoggerLike;
}

type PinoFactory = (options?: { readonly level?: string }) => PinoLoggerLike;

export interface PinoStructuredLoggerOptions {
  /** Inject a pre-built pino instance (e.g. in tests) instead of loading the driver. */
  readonly instance?: PinoLoggerLike;
  readonly context?: LogContext;
  readonly level?: LogLevel;
  readonly resolver?: ModuleResolver;
}

/**
 * {@link StructuredLogger} backed by `pino`. The `pino` package is loaded
 * lazily via {@link loadDriver}; install it (`yarn add pino`) or pass an
 * `instance` to use this logger.
 */
export class PinoStructuredLogger implements StructuredLogger {
  private readonly instance: PinoLoggerLike;
  private readonly context: LogContext;

  public constructor(options: PinoStructuredLoggerOptions = {}) {
    this.context = options.context ?? new LogContext();
    this.instance =
      options.instance ??
      loadDriver<PinoFactory>(
        'pino',
        options.resolver,
      )({
        level: options.level ?? 'info',
      });
  }

  public debug(message: string, context?: LogMetadata): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: LogMetadata): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogMetadata): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: LogMetadata): void {
    this.log('error', message, context);
  }

  public child(context: LogContext): PinoStructuredLogger {
    return new PinoStructuredLogger({
      instance: this.instance.child(context.toObject()),
      context: this.context.child({
        correlationId: context.correlationId,
        traceId: context.traceId,
        spanId: context.spanId,
        metadata: context.metadata,
      }),
    });
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (message.trim().length === 0) {
      throw new Error('Log message must not be empty');
    }
    this.instance[level](
      { ...this.context.toObject(), ...(metadata ?? {}) },
      message,
    );
  }
}
