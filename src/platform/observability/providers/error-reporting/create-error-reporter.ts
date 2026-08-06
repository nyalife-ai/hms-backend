import { ObservabilityErrorReporterKind } from '../../configuration/observability.config';
import { ErrorReporter } from '../../error-tracking/error-reporter.interface';
import { InMemoryErrorReporter } from '../../error-tracking/in-memory-error-reporter';
import { ModuleResolver } from '../load-optional';
import { NoopErrorReporter } from '../noop/noop-error-reporter';
import { BugsnagErrorReporter } from './bugsnag.error-reporter';
import { SentryErrorReporter } from './sentry.error-reporter';

export interface CreateErrorReporterOptions {
  readonly sentryDsn?: string;
  readonly bugsnagApiKey?: string;
  readonly fallback?: ErrorReporter;
  readonly resolver?: ModuleResolver;
}

/** Factory selecting an {@link ErrorReporter} implementation by kind. */
export function createErrorReporter(
  kind: ObservabilityErrorReporterKind,
  options: CreateErrorReporterOptions = {},
): ErrorReporter {
  switch (kind) {
    case 'memory':
      return new InMemoryErrorReporter();
    case 'noop':
      return new NoopErrorReporter();
    case 'sentry':
      return new SentryErrorReporter({
        dsn: options.sentryDsn,
        fallback: options.fallback,
        resolver: options.resolver,
      });
    case 'bugsnag':
      return new BugsnagErrorReporter({
        apiKey: options.bugsnagApiKey,
        fallback: options.fallback,
        resolver: options.resolver,
      });
    default:
      throw new RangeError(
        `Unknown observability error reporter kind: ${String(kind)}`,
      );
  }
}
