export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorContext = Readonly<Record<string, unknown>>;

export interface ErrorReport {
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly severity: ErrorSeverity;
  readonly context: ErrorContext;
  readonly occurrences: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

export interface ErrorReporter {
  capture(
    error: Error,
    context?: ErrorContext,
    severity?: ErrorSeverity,
  ): string;
}
