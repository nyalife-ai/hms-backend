export type DeepTransformer = (
  value: unknown,
  key: string | undefined,
  path: readonly string[],
) => unknown;

export const transformDeep = (
  value: unknown,
  transformer: DeepTransformer,
  path: readonly string[] = [],
  seen: WeakMap<object, unknown> = new WeakMap(),
): unknown => {
  const key = path.at(-1);
  const transformed = transformer(value, key, path);
  if (
    transformed === null ||
    typeof transformed !== 'object' ||
    transformed instanceof Date
  )
    return transformed;
  const existing = seen.get(transformed);
  if (existing !== undefined) return existing;
  const output: unknown[] | Record<string, unknown> = Array.isArray(transformed)
    ? []
    : {};
  seen.set(transformed, output);
  for (const [childKey, child] of Object.entries(transformed)) {
    (output as Record<string, unknown>)[childKey] = transformDeep(
      child,
      transformer,
      [...path, childKey],
      seen,
    );
  }
  return output;
};

export const excludeFields = (
  value: unknown,
  excludedKeys: readonly string[],
): unknown => {
  const excluded = new Set(excludedKeys.map((key) => key.toLocaleLowerCase()));
  return transformDeep(value, (item, key) =>
    key !== undefined && excluded.has(key.toLocaleLowerCase())
      ? '[REDACTED]'
      : item,
  );
};

export const redactSecrets = (
  value: unknown,
  keys: readonly string[] = [
    'password',
    'token',
    'secret',
    'authorization',
    'apiKey',
  ],
): unknown => excludeFields(value, keys);

export const toPlainObject = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value));
