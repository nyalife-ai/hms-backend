export const formatThousands = (value: number, locale = 'en-US'): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
export const formatFixed = (value: number, decimals: number): string => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 100)
    throw new RangeError('Invalid decimal count');
  return value.toFixed(decimals);
};
export const formatPercentage = (value: number, decimals = 0): string =>
  `${formatFixed(value, decimals)}%`;
export const formatCompact = (value: number, precision = 1): string => {
  const absolute = Math.abs(value);
  const units: readonly [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  const unit = units.find(([threshold]) => absolute >= threshold);
  if (unit === undefined) return String(value);
  const formatted = (value / unit[0]).toFixed(precision).replace(/\.?0+$/, '');
  return `${formatted}${unit[1]}`;
};
