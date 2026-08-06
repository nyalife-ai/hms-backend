export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

export const createDateRange = (start: Date, end: Date): DateRange => {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new TypeError('Date range requires valid dates');
  }
  if (start.getTime() > end.getTime())
    throw new RangeError('Date range start must not exceed end');
  return { start: new Date(start), end: new Date(end) };
};
