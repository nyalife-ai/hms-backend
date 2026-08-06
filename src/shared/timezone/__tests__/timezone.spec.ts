import {
  formatInTimeZone,
  getTimeZoneOffsetMinutes,
  isValidTimeZone,
  utcToZonedTime,
  zonedTimeToUtc,
} from '../timezone';

describe('timezone utilities', () => {
  it('validates IANA time zone identifiers', () => {
    expect(isValidTimeZone('Africa/Nairobi')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  it('formats dates in a target time zone with optional styles', () => {
    const date = new Date('2024-01-01T12:00:00Z');
    expect(
      formatInTimeZone(date, { timeZone: 'UTC', dateStyle: 'short' }),
    ).toBeTruthy();
    expect(formatInTimeZone(date, { timeZone: 'UTC' })).toBeTruthy();
    expect(
      formatInTimeZone(date, {
        timeZone: 'Africa/Nairobi',
        locale: 'en-GB',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    ).toBeTruthy();
  });

  it('rejects invalid dates and time zones', () => {
    expect(() =>
      formatInTimeZone(new Date('invalid'), { timeZone: 'UTC' }),
    ).toThrow(TypeError);
    expect(() =>
      formatInTimeZone(new Date(), { timeZone: 'Not/AZone' }),
    ).toThrow(RangeError);
    expect(() => getTimeZoneOffsetMinutes(new Date('invalid'), 'UTC')).toThrow(
      TypeError,
    );
    expect(() => getTimeZoneOffsetMinutes(new Date(), 'Not/AZone')).toThrow(
      RangeError,
    );
  });

  it('computes UTC offsets for fixed-offset zones', () => {
    const date = new Date('2024-01-01T12:00:00Z');
    expect(getTimeZoneOffsetMinutes(date, 'Africa/Nairobi')).toBe(180);
    expect(getTimeZoneOffsetMinutes(date, 'UTC')).toBe(0);
  });

  it('converts between zoned wall-clock time and UTC instants', () => {
    const localAsUtcFields = new Date('2024-01-01T15:00:00Z');
    const utc = zonedTimeToUtc(localAsUtcFields, 'Africa/Nairobi');
    expect(utc.toISOString()).toBe('2024-01-01T12:00:00.000Z');

    const utcInstant = new Date('2024-01-01T12:00:00Z');
    const zoned = utcToZonedTime(utcInstant, 'Africa/Nairobi');
    expect(zoned.toISOString()).toBe('2024-01-01T15:00:00.000Z');
  });
});
