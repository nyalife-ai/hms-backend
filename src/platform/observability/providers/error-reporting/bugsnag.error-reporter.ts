import {
  ErrorContext,
  ErrorReporter,
  ErrorSeverity,
} from '../../error-tracking/error-reporter.interface';
import { InMemoryErrorReporter } from '../../error-tracking/in-memory-error-reporter';
import { ModuleResolver, tryLoadDriver } from '../load-optional';

/** Minimal duck-typed surface of a configured `@bugsnag/js` client. */
export interface BugsnagClientLike {
  notify(
    error: Error,
    options?: {
      readonly severity?: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
    },
  ): void;
}

interface BugsnagModuleLike {
  start(options: { readonly apiKey: string }): BugsnagClientLike;
}

export interface BugsnagErrorReporterOptions {
  /** Inject a pre-configured client (e.g. in tests) instead of loading `@bugsnag/js`. */
  readonly client?: BugsnagClientLike;
  readonly apiKey?: string;
  /** Used when Bugsnag is not configured/installed. Defaults to {@link InMemoryErrorReporter}. */
  readonly fallback?: ErrorReporter;
  readonly resolver?: ModuleResolver;
}

/**
 * {@link ErrorReporter} backed by Bugsnag. Bugsnag is optional: when no
 * `apiKey` is supplied, or `@bugsnag/js` is not installed, `capture()`
 * transparently falls back to an in-memory reporter instead of throwing.
 */
export class BugsnagErrorReporter implements ErrorReporter {
  private readonly client?: BugsnagClientLike;
  private readonly fallback: ErrorReporter;

  public constructor(options: BugsnagErrorReporterOptions = {}) {
    this.client =
      options.client ?? this.initClient(options.apiKey, options.resolver);
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
    this.client.notify(error, { severity, metadata: context });
    return this.fingerprint(error);
  }

  private initClient(
    apiKey: string | undefined,
    resolver: ModuleResolver | undefined,
  ): BugsnagClientLike | undefined {
    if (!apiKey) {
      return undefined;
    }
    const bugsnagModule = tryLoadDriver<BugsnagModuleLike>(
      '@bugsnag/js',
      resolver,
    );
    return bugsnagModule?.start({ apiKey });
  }

  /** Bugsnag's `notify()` does not return an id, so a stable fingerprint is derived locally. */
  private fingerprint(error: Error): string {
    const input = `${error.name}:${error.message}:${error.stack ?? ''}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `bugsnag_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
}
