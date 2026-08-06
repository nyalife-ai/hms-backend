export interface FormatInTimeZoneOptions {
  readonly timeZone: string;
  readonly locale?: string;
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short';
  readonly timeStyle?: 'full' | 'long' | 'medium' | 'short';
}

const validTime = (date: Date): Date => {
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('Invalid date');
  }
  return date;
};

/** Validates an IANA time zone identifier (e.g. `Africa/Nairobi`) using `Intl`. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA time zone: "${timeZone}"`);
  }
}

/** Formats a date in the given time zone using `Intl.DateTimeFormat`. */
export function formatInTimeZone(
  date: Date,
  options: FormatInTimeZoneOptions,
): string {
  validTime(date);
  assertValidTimeZone(options.timeZone);
  return new Intl.DateTimeFormat(options.locale ?? 'en-US', {
    timeZone: options.timeZone,
    ...(options.dateStyle === undefined
      ? {}
      : { dateStyle: options.dateStyle }),
    ...(options.timeStyle === undefined
      ? {}
      : { timeStyle: options.timeStyle }),
  }).format(date);
}

/**
 * Returns the UTC offset, in minutes, that `timeZone` observes at `date`.
 * Positive means ahead of UTC (e.g. `Africa/Nairobi` is `+180`).
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  validTime(date);
  assertValidTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Converts a wall-clock date/time as observed in `timeZone` to a UTC `Date`. */
export function zonedTimeToUtc(date: Date, timeZone: string): Date {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  return new Date(date.getTime() - offsetMinutes * 60_000);
}

/** Converts a UTC `Date` to the equivalent wall-clock date/time in `timeZone`. */
export function utcToZonedTime(date: Date, timeZone: string): Date {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  return new Date(date.getTime() + offsetMinutes * 60_000);
}
