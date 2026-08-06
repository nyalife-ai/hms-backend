import { assertPositiveInteger } from '../../architecture/production-defaults';
import {
  ErrorContext,
  ErrorReport,
  ErrorReporter,
  ErrorSeverity,
} from './error-reporter.interface';

export interface InMemoryErrorReporterOptions {
  /** Maximum distinct fingerprints retained. Defaults to 1_000. */
  readonly maxEntries?: number;
  readonly now?: () => number;
}

export class InMemoryErrorReporter implements ErrorReporter {
  private readonly reports = new Map<string, ErrorReport>();
  private readonly insertionOrder: string[] = [];
  private readonly maxEntries: number;
  private readonly now: () => number;

  public constructor(
    nowOrOptions: (() => number) | InMemoryErrorReporterOptions = Date.now,
  ) {
    if (typeof nowOrOptions === 'function') {
      this.now = nowOrOptions;
      this.maxEntries = 1_000;
    } else {
      this.now = nowOrOptions.now ?? Date.now;
      this.maxEntries = assertPositiveInteger(
        nowOrOptions.maxEntries ?? 1_000,
        'InMemoryErrorReporter maxEntries',
      );
    }
  }

  public capture(
    error: Error,
    context: ErrorContext = {},
    severity: ErrorSeverity = 'medium',
  ): string {
    if (!(error instanceof Error)) {
      throw new Error('Only Error instances can be captured');
    }
    const fingerprint = this.fingerprint(error);
    const timestamp = this.now();
    const existing = this.reports.get(fingerprint);
    if (!existing && this.reports.size >= this.maxEntries) {
      const oldest = this.insertionOrder.shift();
      if (oldest) {
        this.reports.delete(oldest);
      }
    }
    if (!existing) {
      this.insertionOrder.push(fingerprint);
    }
    this.reports.set(
      fingerprint,
      Object.freeze({
        fingerprint,
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
        severity: this.maximumSeverity(existing?.severity, severity),
        context: Object.freeze({ ...(existing?.context ?? {}), ...context }),
        occurrences: (existing?.occurrences ?? 0) + 1,
        firstSeenAt: existing?.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
      }),
    );
    return fingerprint;
  }

  public list(): readonly ErrorReport[] {
    return Object.freeze([...this.reports.values()]);
  }

  public clear(): void {
    this.reports.clear();
    this.insertionOrder.length = 0;
  }

  private fingerprint(error: Error): string {
    const input = `${error.name}:${error.message}:${error.stack ?? ''}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `error_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  private maximumSeverity(
    current: ErrorSeverity | undefined,
    incoming: ErrorSeverity,
  ): ErrorSeverity {
    const order: readonly ErrorSeverity[] = [
      'low',
      'medium',
      'high',
      'critical',
    ];
    return current && order.indexOf(current) > order.indexOf(incoming)
      ? current
      : incoming;
  }
}
