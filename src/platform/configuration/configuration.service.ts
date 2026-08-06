import { Environment, resolveEnvironment } from './environment';

function immutableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => immutableClone(item)));
  }
  if (value instanceof Date) {
    return Object.freeze(new Date(value));
  }
  if (typeof value === 'object' && value !== null) {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = immutableClone(item);
    }
    return Object.freeze(clone);
  }
  return value;
}

export class ConfigurationService {
  public readonly environment: Environment;
  private readonly values: Readonly<Record<string, unknown>>;

  public constructor(
    values: Readonly<Record<string, unknown>> = {},
    environment?: string,
  ) {
    this.environment = resolveEnvironment(environment);
    this.values = immutableClone(values) as Readonly<Record<string, unknown>>;
  }

  public get<T>(key: string): T | undefined {
    if (key.trim().length === 0) {
      throw new TypeError('Configuration key must be non-empty');
    }
    let current: unknown = this.values;
    for (const segment of key.split('.')) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !(segment in current)
      ) {
        return undefined;
      }
      current = (current as Readonly<Record<string, unknown>>)[segment];
    }
    return current as T | undefined;
  }

  public getOrThrow<T>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new Error(`Missing configuration key "${key}"`);
    }
    return value;
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    return this.values;
  }

  public isEnvironment(environment: Environment): boolean {
    return this.environment === environment;
  }
}
