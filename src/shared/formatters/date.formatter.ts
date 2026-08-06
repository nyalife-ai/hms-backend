import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from '../constants/time.constants';

const assertDate = (date: Date): void => {
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid date');
};
export const formatDateIso = (date: Date): string => {
  assertDate(date);
  return date.toISOString();
};
export const formatDateOnly = (date: Date): string =>
  formatDateIso(date).slice(0, 10);
export const formatTimeOnly = (date: Date): string =>
  formatDateIso(date).slice(11, 19);
export const formatRelativeTime = (date: Date, reference: Date): string => {
  assertDate(date);
  assertDate(reference);
  const difference = date.getTime() - reference.getTime();
  const absolute = Math.abs(difference);
  const units: readonly [number, string][] = [
    [MS_PER_DAY, 'day'],
    [MS_PER_HOUR, 'hour'],
    [MS_PER_MINUTE, 'minute'],
    [MS_PER_SECOND, 'second'],
  ];
  const [unitMs, unit] = units.find(
    ([milliseconds]) => absolute >= milliseconds,
  ) ?? [1, 'millisecond'];
  const amount = Math.round(absolute / unitMs);
  const label = `${unit}${amount === 1 ? '' : 's'}`;
  return difference < 0
    ? `${amount} ${label} ago`
    : difference > 0
      ? `in ${amount} ${label}`
      : 'now';
};
