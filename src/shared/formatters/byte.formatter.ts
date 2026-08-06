import {
  BYTES_PER_GB,
  BYTES_PER_KB,
  BYTES_PER_MB,
} from '../constants/size.constants';

export const formatBytes = (bytes: number, precision = 1): string => {
  if (!Number.isFinite(bytes)) throw new TypeError('Bytes must be finite');
  if (!Number.isInteger(precision) || precision < 0)
    throw new RangeError('Precision must be non-negative');
  const absolute = Math.abs(bytes);
  const units: readonly [number, string][] = [
    [BYTES_PER_GB, 'GB'],
    [BYTES_PER_MB, 'MB'],
    [BYTES_PER_KB, 'KB'],
    [1, 'B'],
  ];
  const [divisor, suffix] = units.find(
    ([threshold]) => absolute >= threshold,
  ) ?? [1, 'B'];
  const value =
    divisor === 1
      ? String(bytes)
      : (bytes / divisor).toFixed(precision).replace(/\.?0+$/, '');
  return `${value} ${suffix}`;
};
