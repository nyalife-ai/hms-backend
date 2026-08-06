export type ConnectionPoolOptions = Readonly<{
  min: number;
  max: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
}>;

export const DEFAULT_POOL_OPTIONS: ConnectionPoolOptions = Object.freeze({
  min: 0,
  max: 10,
  acquireTimeoutMs: 30_000,
  idleTimeoutMs: 10_000,
});

export const mergePoolOptions = (
  overrides: Partial<ConnectionPoolOptions> = {},
): ConnectionPoolOptions => {
  const options = { ...DEFAULT_POOL_OPTIONS, ...overrides };
  if (
    options.min < 0 ||
    options.max < 1 ||
    options.min > options.max ||
    options.acquireTimeoutMs < 0 ||
    options.idleTimeoutMs < 0
  ) {
    throw new Error('Invalid connection pool options');
  }
  return options;
};
