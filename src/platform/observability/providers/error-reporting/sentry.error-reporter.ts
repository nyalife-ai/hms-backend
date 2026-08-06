import {
  ErrorContext,
  ErrorReporter,
  ErrorSeverity,
} from '../../error-tracking/error-reporter.interface';
import { InMemoryErrorReporter } from '../../error-tracking/in-memory-error-reporter';
import { ModuleResolver, tryLoadDriver } from '../load-optional';

/** Minimal duck-typed surface of a configured `@sentry/node` client. */
export interface SentryClientLike {
  captureException(
    error: Error,
    context?: {
      readonly level?: string;
      readonly extra?: Readonly<Record<string, unknown>>;
    },
  ): string;
}

interface SentryModuleLike {
  init(options: { readonly dsn: string }): void;
  captureException(
    error: Error,
    context?: {
      readonly level?: string;
      readonly extra?: Readonly<Record<string, unknown>>;
    },
  ): string;
}

export interface SentryErrorReporterOptions {
  /** Inject a pre-configured client (e.g. in tests) instead of loading `@sentry/node`. */
  readonly client?: SentryClientLike;
  readonly dsn?: string;
  /** Used when Sentry is not configured/installed. Defaults to {@link InMemoryErrorReporter}. */
  readonly fallback?: ErrorReporter;
  readonly resolver?: ModuleResolver;
}

/**
 * {@link ErrorReporter} backed by Sentry. Sentry is optional: when no `dsn`
 * is supplied, or `@sentry/node` is not installed, `capture()` transparently
 * falls back to an in-memory reporter instead of throwing — observability
 * must never crash the caller.
 */
export class SentryErrorReporter implements ErrorReporter {
  private readonly client?: SentryClientLike;
  private readonly fallback: ErrorReporter;

  public constructor(options: SentryErrorReporterOptions = {}) {
    this.client =
      options.client ?? this.initClient(options.dsn, options.resolver);
    this.fallback = options.fallback ?? new InMemoryErrorReporter();
  }

  public capture(
    error: Error,
    context: ErrorContext = {},
    severity: ErrorSeverity = 'medium',
  ): string {
    if (!(error instanceof Error)) {
      throw new Error('Only Error instances can be captured');
    }
    if (!this.client) {
      return this.fallback.capture(error, context, severity);
    }
    return this.client.captureException(error, {
      level: severity,
      extra: context,
    });
  }

  private initClient(
    dsn: string | undefined,
    resolver: ModuleResolver | undefined,
  ): SentryClientLike | undefined {
    if (!dsn) {
      return undefined;
    }
    const sentryModule = tryLoadDriver<SentryModuleLike>(
      '@sentry/node',
      resolver,
    );
    if (!sentryModule) {
      return undefined;
    }
    sentryModule.init({ dsn });
    return {
      captureException: (error, ctx): string =>
        sentryModule.captureException(error, ctx),
    };
  }
}
