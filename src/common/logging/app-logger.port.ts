/**
 * Narrow logging surface used by framework HTTP filters/interceptors.
 *
 * Concrete loggers (e.g. Winston-backed AppLogger) live in feature modules;
 * common code depends only on this port so the foundation can build without
 * importing business modules.
 */
export interface HttpRequestLogData {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  userId?: string | number;
  requestId?: string;
}

export interface AppLoggerPort {
  setContext(context: string): unknown;
  error(
    message: string,
    trace?: string,
    meta?: Record<string, unknown> | string,
  ): void;
  warn(message: string, meta?: Record<string, unknown> | string): void;
  log?(message: string, meta?: Record<string, unknown> | string): void;
  logRequest?(data: HttpRequestLogData): void;
}
