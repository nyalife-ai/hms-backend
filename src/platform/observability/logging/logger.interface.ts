export type LogMetadata = Readonly<Record<string, unknown>>;

export interface StructuredLogger {
  debug(message: string, context?: LogMetadata): void;
  info(message: string, context?: LogMetadata): void;
  warn(message: string, context?: LogMetadata): void;
  error(message: string, context?: LogMetadata): void;
}

export interface LogSink {
  write(entry: Readonly<Record<string, unknown>>): void;
}
