import { LogContext } from './log-context';
import { LogMetadata, LogSink, StructuredLogger } from './logger.interface';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class ConsoleLogSink implements LogSink {
  public write(entry: Readonly<Record<string, unknown>>): void {
    console.log(JSON.stringify(entry));
  }
}

export class JsonStructuredLogger implements StructuredLogger {
  public constructor(
    private readonly sink: LogSink = new ConsoleLogSink(),
    private readonly context: LogContext = new LogContext(),
    private readonly minimumLevel: LogLevel = 'info',
    private readonly timestamp: () => string = (): string =>
      new Date().toISOString(),
  ) {}

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

  public child(context: LogContext): JsonStructuredLogger {
    return new JsonStructuredLogger(
      this.sink,
      this.context.child({
        correlationId: context.correlationId,
        traceId: context.traceId,
        spanId: context.spanId,
        metadata: context.metadata,
      }),
      this.minimumLevel,
      this.timestamp,
    );
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minimumLevel]) {
      return;
    }
    if (message.trim().length === 0) {
      throw new Error('Log message must not be empty');
    }
    this.sink.write({
      timestamp: this.timestamp(),
      level,
      message,
      ...this.context.toObject(),
      ...(metadata ?? {}),
    });
  }
}
