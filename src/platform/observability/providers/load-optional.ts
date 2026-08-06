/**
 * Optional driver loading, scoped to the observability platform slice.
 *
 * Platform must not depend on infrastructure (infrastructure depends on
 * platform, never the reverse), so this intentionally mirrors
 * `src/infrastructure/optional-driver.ts` rather than importing it. Heavy
 * observability SDKs (`@opentelemetry/*`, `pino`, `winston`, `@sentry/node`,
 * `@bugsnag/js`) are therefore optional: callers get a working scaffold
 * without installing every driver, and an actionable error when a genuinely
 * required one is missing.
 */

export type ModuleResolver = (specifier: string) => unknown;

export class MissingDriverError extends Error {
  public readonly packageName: string;
  public readonly cause?: unknown;

  public constructor(packageName: string, cause?: unknown) {
    super(
      `Driver "${packageName}" is not installed. Run: yarn add ${packageName}`,
    );
    this.name = 'MissingDriverError';
    this.packageName = packageName;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const defaultResolver: ModuleResolver = (specifier) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(specifier) as unknown;

/**
 * Resolves an optional driver package.
 *
 * @throws {MissingDriverError} when the package cannot be resolved.
 */
export function loadDriver<T>(
  packageName: string,
  resolver: ModuleResolver = defaultResolver,
): T {
  try {
    return resolver(packageName) as T;
  } catch (error: unknown) {
    throw new MissingDriverError(packageName, error);
  }
}

/**
 * Resolves an optional driver package, returning `undefined` when absent.
 */
export function tryLoadDriver<T>(
  packageName: string,
  resolver: ModuleResolver = defaultResolver,
): T | undefined {
  try {
    return resolver(packageName) as T;
  } catch {
    return undefined;
  }
}
