export const clamp = (
  value: number,
  minimum: number,
  maximum: number,
): number => {
  if (minimum > maximum) throw new RangeError('Minimum cannot exceed maximum');
  return Math.min(maximum, Math.max(minimum, value));
};
export const roundTo = (value: number, precision = 0): number => {
  if (!Number.isInteger(precision))
    throw new TypeError('Precision must be an integer');
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const safeParseInt = (
  value: unknown,
  radix = 10,
): number | undefined => {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    !Number.isInteger(radix) ||
    radix < 2 ||
    radix > 36
  )
    return undefined;
  const normalized = value.trim();
  const parsed = Number.parseInt(normalized, radix);
  return Number.isFinite(parsed) &&
    parsed.toString(radix).toLowerCase() ===
      normalized.replace(/^\+/, '').toLowerCase()
    ? parsed
    : undefined;
};
export const safeParseFloat = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
export const percentage = (part: number, total: number): number | undefined =>
  total === 0 || !Number.isFinite(part) || !Number.isFinite(total)
    ? undefined
    : (part / total) * 100;
