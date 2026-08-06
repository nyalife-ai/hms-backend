type Comparable = string | number | bigint | boolean | Date | null | undefined;

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
  if (!Number.isInteger(size) || size <= 0)
    throw new RangeError('Chunk size must be a positive integer');
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    output.push(items.slice(index, index + size));
  return output;
};
export const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
export const uniqueBy = <T, K>(
  items: readonly T[],
  selector: (item: T) => K,
): T[] => {
  const seen = new Set<K>();
  return items.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
export const groupBy = <T, K extends PropertyKey>(
  items: readonly T[],
  selector: (item: T) => K,
): Record<K, T[]> => {
  // Null-prototype buckets avoid `__proto__` / `constructor` key hijacking.
  const output = Object.create(null) as Record<K, T[]>;
  for (const item of items) (output[selector(item)] ??= []).push(item);
  return output;
};
export const partition = <T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
): [T[], T[]] => {
  const matches: T[] = [];
  const rest: T[] = [];
  for (const item of items) (predicate(item) ? matches : rest).push(item);
  return [matches, rest];
};
const compare = (left: Comparable, right: Comparable): number => {
  if (Object.is(left, right)) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;
  return a < b ? -1 : 1;
};
export const sortBy = <T>(
  items: readonly T[],
  ...selectors: readonly ((item: T) => Comparable)[]
): T[] =>
  [...items].sort((left, right) => {
    for (const selector of selectors) {
      const result = compare(selector(left), selector(right));
      if (result !== 0) return result;
    }
    return 0;
  });
export const sum = (items: readonly number[]): number =>
  items.reduce((total, item) => total + item, 0);
export const compact = <T>(
  items: readonly (T | null | undefined | false | 0 | '')[],
): T[] => items.filter(Boolean) as T[];
export const zip = <A, B>(
  left: readonly A[],
  right: readonly B[],
): [A | undefined, B | undefined][] =>
  Array.from({ length: Math.max(left.length, right.length) }, (_, index) => [
    left[index],
    right[index],
  ]);
export const difference = <T>(left: readonly T[], right: readonly T[]): T[] => {
  const excluded = new Set(right);
  return left.filter((item) => !excluded.has(item));
};
export const intersection = <T>(
  left: readonly T[],
  right: readonly T[],
): T[] => {
  const included = new Set(right);
  return unique(left.filter((item) => included.has(item)));
};
