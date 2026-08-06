import { LogContext } from '../../logging/log-context';
import { LogMetadata, StructuredLogger } from '../../logging/logger.interface';
import { LogLevel } from '../../logging/structured-logger';
import { loadDriver, ModuleResolver } from '../load-optional';

/** Minimal duck-typed surface of a `winston` logger instance. */
export interface WinstonLoggerLike {
  log(level: string, message: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): WinstonLoggerLike;
}

/** Minimal duck-typed surface of the `winston` package entrypoint. */
export interface WinstonModuleLike {
  createLogger(options: Record<string, unknown>): WinstonLoggerLike;
  format: {
    combine(...formats: readonly unknown[]): unknown;
    json(): unknown;
    timestamp(): unknown;
  };
  transports: {
    Console: new (options?: Record<string, unknown>) => unknown;
  };
}

export interface WinstonStructuredLoggerOptions {
  /** Inject a pre-built winston instance (e.g. in tests) instead of loading the driver. */
  readonly instance?: WinstonLoggerLike;
  readonly context?: LogContext;
  readonly level?: LogLevel;
  readonly resolver?: ModuleResolver;
}

/**
 * {@link StructuredLogger} backed by `winston`. The `winston` package is
 * loaded lazily via {@link loadDriver}; install it (`yarn add winston`) or
 * pass an `instance` to use this logger.
 */
export class WinstonStructuredLogger implements StructuredLogger {
  private readonly instance: WinstonLoggerLike;
  private readonly context: LogContext;

  public constructor(options: WinstonStructuredLoggerOptions = {}) {
    this.context = options.context ?? new LogContext();
    this.instance = options.instance ?? this.createInstance(options);
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

  public child(context: LogContext): WinstonStructuredLogger {
    return new WinstonStructuredLogger({
      instance: this.instance.child(context.toObject()),
      context: this.context.child({
        correlationId: context.correlationId,
        traceId: context.traceId,
        spanId: context.spanId,
        metadata: context.metadata,
      }),
    });
  }

  private createInstance(
    options: WinstonStructuredLoggerOptions,
  ): WinstonLoggerLike {
    const winston = loadDriver<WinstonModuleLike>('winston', options.resolver);
    return winston.createLogger({
      level: options.level ?? 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [new winston.transports.Console()],
    });
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (message.trim().length === 0) {
      throw new Error('Log message must not be empty');
    }
    this.instance.log(level, message, {
      ...this.context.toObject(),
      ...(metadata ?? {}),
    });
  }
}
