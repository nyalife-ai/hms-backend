/**
 * Optional driver loading for infrastructure adapters.
 *
 * A reusable scaffold must not force every project to install every driver
 * (Kafka, RabbitMQ, NATS, S3, Azure, GCS...). Each adapter therefore depends on
 * a narrow port and receives its driver through the constructor. The default
 * factory resolves the real package at runtime and fails with an actionable
 * message when it is absent.
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
