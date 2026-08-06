import type { DateRange } from '../types/date-range.types';
import { MS_PER_DAY, MS_PER_MINUTE } from '../constants/time.constants';

const validTime = (date: Date): number => {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new TypeError('Invalid date');
  return time;
};

export const addDays = (date: Date, days: number): Date =>
  new Date(validTime(date) + days * MS_PER_DAY);
export const addMinutes = (date: Date, minutes: number): Date =>
  new Date(validTime(date) + minutes * MS_PER_MINUTE);
export const startOfDay = (date: Date): Date => {
  validTime(date);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};
export const endOfDay = (date: Date): Date =>
  new Date(startOfDay(date).getTime() + MS_PER_DAY - 1);
export const isBefore = (left: Date, right: Date): boolean =>
  validTime(left) < validTime(right);
export const isAfter = (left: Date, right: Date): boolean =>
  validTime(left) > validTime(right);
export const differenceInMs = (left: Date, right: Date): number =>
  validTime(left) - validTime(right);
export const isWithinRange = (date: Date, range: DateRange): boolean => {
  const time = validTime(date);
  return time >= validTime(range.start) && time <= validTime(range.end);
};
export const formatIso = (date: Date): string => {
  validTime(date);
  return date.toISOString();
};
export const parseIso = (value: string): Date | undefined => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? date
    : undefined;
};
