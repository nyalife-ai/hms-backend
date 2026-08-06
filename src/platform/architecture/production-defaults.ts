/**
 * Shared production / in-memory policy for platform dynamic modules.
 *
 * In-memory adapters are allowed when `allowInMemory: true` or the resolved
 * environment is non-production. Production fails fast unless durable /
 * external providers are supplied.
 */
export interface ProductionAwareOptions {
  /**
   * Explicit environment name. When set, `'production'` selects production
   * mode (unless `isProduction` overrides).
   */
  readonly environment?: string;
  /**
   * Override production detection. Defaults to `environment === 'production'`
   * or `NODE_ENV === 'production'`.
   */
  readonly isProduction?: boolean;
  /**
   * Explicitly allow process-local in-memory defaults in production.
   * Required to use in-memory adapters when production mode is active.
   */
  readonly allowInMemory?: boolean;
}

export const resolveIsProduction = (
  options: ProductionAwareOptions = {},
): boolean => {
  if (options.isProduction !== undefined) {
    return options.isProduction;
  }
  if (options.environment !== undefined) {
    return options.environment.trim().toLowerCase() === 'production';
  }
  return process.env['NODE_ENV'] === 'production';
};

/**
 * True when in-memory defaults may be substituted for missing providers.
 * Always true outside production; in production requires `allowInMemory: true`.
 */
export const allowInMemoryDefaults = (
  options: ProductionAwareOptions = {},
): boolean => options.allowInMemory === true || !resolveIsProduction(options);

export const assertPositiveInteger = (value: number, label: string): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
};
