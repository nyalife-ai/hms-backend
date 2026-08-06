const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isBufferLike = (value: object): boolean =>
  typeof Buffer !== 'undefined' && Buffer.isBuffer(value);

/**
 * Returns true for null-prototype objects and ordinary `{}` literals.
 * Explicitly rejects `Object.prototype` itself (its prototype is `null`).
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  if (value === Object.prototype) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

export const pick = <T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> => {
  const output = {} as Pick<T, K>;
  for (const key of keys)
    if (Object.prototype.hasOwnProperty.call(value, key))
      output[key] = value[key];
  return output;
};

export const omit = <T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> => {
  const excluded = new Set<PropertyKey>(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.has(key)),
  ) as Omit<T, K>;
};

const cloneComplex = (
  value: Date | Map<unknown, unknown> | Set<unknown> | RegExp | Buffer,
): unknown => {
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map) {
    const output = new Map();
    for (const [key, item] of value.entries()) {
      output.set(deepClone(key), deepClone(item));
    }
    return output;
  }
  if (value instanceof Set) {
    const output = new Set();
    for (const item of value.values()) {
      output.add(deepClone(item));
    }
    return output;
  }
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  return Buffer.from(value);
};

export const deepClone = <T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T => {
  if (value === null || typeof value !== 'object') return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing as T;
  if (value instanceof Date) return cloneComplex(value) as T;
  if (value instanceof Map) return cloneComplex(value) as T;
  if (value instanceof Set) return cloneComplex(value) as T;
  if (value instanceof RegExp) return cloneComplex(value) as T;
  if (isBufferLike(value)) return cloneComplex(value as unknown as Buffer) as T;
  const output: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : {};
  seen.set(value, output);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    (output as Record<string, unknown>)[key] = deepClone(item, seen);
  }
  return output as T;
};

export const deepMerge = <T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
): T => {
  const output = deepClone(base);
  const writable: Record<string, unknown> = output;
  for (const [key, value] of Object.entries(patch)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new TypeError(`Unsafe object key: ${key}`);
    }
    const current = writable[key];
    writable[key] =
      isPlainObject(current) && isPlainObject(value)
        ? deepMerge(current, value)
        : deepClone(value);
  }
  return output;
};

const equalComplex = (
  left: object,
  right: object,
  seen: WeakMap<object, object>,
): boolean => {
  if (left instanceof Date && right instanceof Date)
    return left.getTime() === right.getTime();
  if (left instanceof RegExp && right instanceof RegExp)
    return left.source === right.source && left.flags === right.flags;
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) return false;
    const remaining = [...right.entries()];
    for (const [key, value] of left.entries()) {
      const index = remaining.findIndex(([candidateKey]) =>
        deepEqual(key, candidateKey, seen),
      );
      if (index < 0 || !deepEqual(value, remaining[index][1], seen))
        return false;
      remaining.splice(index, 1);
    }
    return true;
  }
  if (left instanceof Set && right instanceof Set) {
    if (left.size !== right.size) return false;
    for (const value of left.values()) {
      let matched = false;
      for (const candidate of right.values()) {
        if (deepEqual(value, candidate, seen)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }
  if (isBufferLike(left) && isBufferLike(right))
    return (left as Buffer).equals(right as Buffer);
  return false;
};

export const deepEqual = (
  left: unknown,
  right: unknown,
  seen: WeakMap<object, object> = new WeakMap(),
): boolean => {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  )
    return false;
  if (
    left instanceof Date ||
    right instanceof Date ||
    left instanceof Map ||
    right instanceof Map ||
    left instanceof Set ||
    right instanceof Set ||
    left instanceof RegExp ||
    right instanceof RegExp ||
    isBufferLike(left) ||
    isBufferLike(right)
  ) {
    return equalComplex(left, right, seen);
  }
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        deepEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
          seen,
        ),
    )
  );
};

export const flatten = (
  value: Record<string, unknown>,
  separator = '.',
): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  const visit = (
    item: Record<string, unknown>,
    prefix: string,
    seen: WeakSet<object>,
  ): void => {
    if (seen.has(item)) {
      throw new TypeError('Cannot flatten cyclic structures');
    }
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      const path = prefix ? `${prefix}${separator}${key}` : key;
      if (isPlainObject(child) && Object.keys(child).length > 0)
        visit(child, path, seen);
      else output[path] = child;
    }
    seen.delete(item);
  };
  visit(value, '', new WeakSet());
  return output;
};

export const unflatten = (
  value: Record<string, unknown>,
  separator = '.',
): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(value)) {
    const keys = path.split(separator);
    let cursor = output;
    keys.forEach((key, index) => {
      if (UNSAFE_KEYS.has(key)) throw new TypeError('Unsafe object path');
      if (index === keys.length - 1) cursor[key] = item;
      else {
        if (!isPlainObject(cursor[key])) cursor[key] = {};
        cursor = cursor[key] as Record<string, unknown>;
      }
    });
  }
  return output;
};

export const removeUndefined = <T extends Record<string, unknown>>(
  value: T,
): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as Partial<T>;
