import {
  ellipsis,
  formatBytes,
  formatCompact,
  formatDateIso,
  formatDateOnly,
  formatFixed,
  formatPercentage,
  formatRelativeTime,
  formatThousands,
  formatTimeOnly,
  maskEmail,
  maskPhone,
  maskString,
  titleCase,
} from '..';

describe('date formatters', () => {
  const reference = new Date('2024-01-02T00:00:00.000Z');
  it('formats ISO date and time components', () => {
    expect(formatDateIso(reference)).toBe('2024-01-02T00:00:00.000Z');
    expect(formatDateOnly(reference)).toBe('2024-01-02');
    expect(formatTimeOnly(reference)).toBe('00:00:00');
    expect(() => formatDateIso(new Date('bad'))).toThrow(TypeError);
    expect(() => formatRelativeTime(reference, new Date('bad'))).toThrow(
      TypeError,
    );
  });
  it('formats relative past, future, singular, plural, and now', () => {
    expect(
      formatRelativeTime(
        new Date(reference.getTime() - 3 * 86_400_000),
        reference,
      ),
    ).toBe('3 days ago');
    expect(
      formatRelativeTime(new Date(reference.getTime() - 3_600_000), reference),
    ).toBe('1 hour ago');
    expect(
      formatRelativeTime(new Date(reference.getTime() + 120_000), reference),
    ).toBe('in 2 minutes');
    expect(
      formatRelativeTime(new Date(reference.getTime() + 1_000), reference),
    ).toBe('in 1 second');
    expect(
      formatRelativeTime(new Date(reference.getTime() + 2), reference),
    ).toBe('in 2 milliseconds');
    expect(formatRelativeTime(reference, reference)).toBe('now');
    expect(() => formatRelativeTime(new Date('bad'), reference)).toThrow(
      TypeError,
    );
  });
});

describe('number and byte formatters', () => {
  it('formats generic numbers', () => {
    expect(formatThousands(1234)).toBe('1,234');
    expect(formatThousands(1234, 'de-DE')).toBe('1.234');
    expect(formatFixed(1.2, 2)).toBe('1.20');
    expect(() => formatFixed(1, -1)).toThrow(RangeError);
    expect(() => formatFixed(1, 101)).toThrow(RangeError);
    expect(() => formatFixed(1, 1.2)).toThrow(RangeError);
    expect(formatPercentage(12.345, 1)).toBe('12.3%');
    expect(formatPercentage(12)).toBe('12%');
    expect(formatCompact(1_200)).toBe('1.2K');
    expect(formatCompact(2_000_000)).toBe('2M');
    expect(formatCompact(-1_200_000_000, 2)).toBe('-1.2B');
    expect(formatCompact(999)).toBe('999');
  });
  it('formats byte magnitudes and validates inputs', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1_048_576, 2)).toBe('1 MB');
    expect(formatBytes(1_073_741_824)).toBe('1 GB');
    expect(formatBytes(-2048)).toBe('-2 KB');
    expect(formatBytes(12)).toBe('12 B');
    expect(() => formatBytes(Infinity)).toThrow(TypeError);
    expect(() => formatBytes(1, -1)).toThrow(RangeError);
    expect(() => formatBytes(1, 1.5)).toThrow(RangeError);
  });
});

describe('string formatters', () => {
  it('masks and presents generic strings', () => {
    expect(maskEmail('person@example.com')).toBe('p*****@example.com');
    expect(maskEmail('invalid')).toBe('*******');
    expect(maskEmail('@host')).toBe('*****');
    expect(maskPhone('+1234567890')).toBe('*******7890');
    expect(maskPhone('12')).toBe('**');
    expect(maskString('abcdef', 1, 1)).toBe('a****f');
    expect(maskString('abc')).toBe('***');
    expect(ellipsis('abcdef', 4)).toBe('abc…');
    expect(titleCase('helloWorld_example-value')).toBe(
      'Hello World Example Value',
    );
    expect(titleCase('___')).toBe('');
  });
});
