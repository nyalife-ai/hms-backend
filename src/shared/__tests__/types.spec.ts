import {
  BYTES_PER_GB,
  BYTES_PER_KB,
  BYTES_PER_MB,
  EMAIL_REGEX,
  Environment,
  E164_PHONE_REGEX,
  HOURS_PER_DAY,
  LogLevel,
  MINUTES_PER_HOUR,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SAFE_FILENAME_REGEX,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  SLUG_REGEX,
  SortDirection,
  URL_REGEX,
  UUID_V4_REGEX,
  createDateRange,
  createEntityId,
  createUlid,
  createUuid,
  isEntityId,
  isUlid,
  isUuid,
} from '..';

describe('shared types and constants', () => {
  it('validates and brands identifiers', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    expect(isUuid(uuid)).toBe(true);
    expect(isUuid(2)).toBe(false);
    expect(createUuid(uuid)).toBe(uuid);
    expect(() => createUuid('bad')).toThrow(TypeError);
    expect(isUlid(ulid)).toBe(true);
    expect(isUlid(null)).toBe(false);
    expect(createUlid(ulid)).toBe(ulid);
    expect(() => createUlid('bad')).toThrow(TypeError);
    expect(isEntityId(' id ')).toBe(true);
    expect(isEntityId(' ')).toBe(false);
    expect(isEntityId(undefined)).toBe(false);
    expect(createEntityId<'thing'>('x')).toBe('x');
    expect(() => createEntityId<'thing'>('')).toThrow(TypeError);
  });

  it('creates defensive valid date ranges', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const range = createDateRange(start, new Date('2024-01-02T00:00:00.000Z'));
    start.setUTCFullYear(2030);
    expect(range.start.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(() => createDateRange(new Date('bad'), new Date())).toThrow(
      TypeError,
    );
    expect(() => createDateRange(new Date(), new Date('bad'))).toThrow(
      TypeError,
    );
    expect(() => createDateRange(new Date(2), new Date(1))).toThrow(RangeError);
  });

  it('exports generic constants and enums', () => {
    expect([MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY]).toEqual([
      1000, 60000, 3600000, 86400000,
    ]);
    expect([
      SECONDS_PER_MINUTE,
      SECONDS_PER_HOUR,
      SECONDS_PER_DAY,
      MINUTES_PER_HOUR,
      HOURS_PER_DAY,
    ]).toEqual([60, 3600, 86400, 60, 24]);
    expect([BYTES_PER_KB, BYTES_PER_MB, BYTES_PER_GB]).toEqual([
      1024, 1048576, 1073741824,
    ]);
    expect(EMAIL_REGEX.test('a@b.co')).toBe(true);
    expect(UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(
      true,
    );
    expect(URL_REGEX.test('https://example.com/a')).toBe(true);
    expect(E164_PHONE_REGEX.test('+123456789')).toBe(true);
    expect(SLUG_REGEX.test('safe-slug')).toBe(true);
    expect(SAFE_FILENAME_REGEX.test('résumé 1.pdf')).toBe(true);
    expect(SAFE_FILENAME_REGEX.test('../secret')).toBe(false);
    expect(SortDirection.ASC).toBe('ASC');
    expect(SortDirection.DESC).toBe('DESC');
    expect(Object.values(LogLevel)).toHaveLength(6);
    expect(Object.values(Environment)).toEqual([
      'development',
      'test',
      'staging',
      'production',
    ]);
  });
});
