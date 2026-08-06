import {
  ErrorContext,
  ErrorReporter,
  ErrorSeverity,
} from '../../error-tracking/error-reporter.interface';

/**
 * Discards captured errors. Used when error reporting is disabled so
 * business code can call `capture()` unconditionally.
 */
export class NoopErrorReporter implements ErrorReporter {
  public capture(
    error: Error,
    context?: ErrorContext,
    severity?: ErrorSeverity,
  ): string {
    void context;
    void severity;
    if (!(error instanceof Error)) {
      throw new Error('Only Error instances can be captured');
    }
    return 'noop';
  }
}
