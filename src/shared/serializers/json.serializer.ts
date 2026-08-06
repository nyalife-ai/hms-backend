const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const prepare = (value: unknown, seen: WeakSet<object>): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => prepare(item, seen));
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .map(([key, item]) => [key, prepare(item, seen)]),
  );
};

export const safeStringify = (
  value: unknown,
  space?: number,
): string | undefined => {
  try {
    return JSON.stringify(prepare(value, new WeakSet()), undefined, space);
  } catch {
    return undefined;
  }
};

export const safeParse = <T = unknown>(
  value: string,
  reviveDates = true,
): T | undefined => {
  try {
    return JSON.parse(value, (_key: string, item: unknown): unknown =>
      reviveDates && typeof item === 'string' && ISO_DATE.test(item)
        ? new Date(item)
        : item,
    ) as T;
  } catch {
    return undefined;
  }
};
