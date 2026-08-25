import {
  changePercent,
  resolvePeriod,
  toYmd,
  alignSeriesByIndex,
} from '../services/period.util';

describe('analytics period.util', () => {
  const now = new Date(2026, 7, 23, 15, 0, 0); // Aug 23 2026

  it('resolves last_30_days and equal-length previous_period', () => {
    const p = resolvePeriod({
      preset: 'last_30_days',
      compare: 'previous_period',
      now,
    });
    expect(toYmd(p.to)).toBe('2026-08-23');
    expect(toYmd(p.from)).toBe('2026-07-25');
    expect(p.compareFrom).not.toBeNull();
    expect(p.compareTo).not.toBeNull();
    const curMs = p.to.getTime() - p.from.getTime();
    const prevMs = p.compareTo!.getTime() - p.compareFrom!.getTime();
    expect(Math.abs(curMs - prevMs)).toBeLessThan(2 * 86400000);
  });

  it('resolves this_month', () => {
    const p = resolvePeriod({ preset: 'this_month', compare: 'none', now });
    expect(toYmd(p.from)).toBe('2026-08-01');
    expect(toYmd(p.to)).toBe('2026-08-23');
    expect(p.compareFrom).toBeNull();
  });

  it('resolves last_180_days and last_365_days', () => {
    const half = resolvePeriod({
      preset: 'last_180_days',
      compare: 'none',
      now,
    });
    expect(toYmd(half.to)).toBe('2026-08-23');
    expect(toYmd(half.from)).toBe('2026-02-25');

    const year = resolvePeriod({
      preset: 'last_365_days',
      compare: 'none',
      now,
    });
    expect(toYmd(year.to)).toBe('2026-08-23');
    expect(toYmd(year.from)).toBe('2025-08-24');
  });

  it('changePercent never returns Infinity', () => {
    expect(changePercent(100, 0)).toBeNull();
    expect(changePercent(0, 0)).toBe(0);
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
  });

  it('alignSeriesByIndex maps previous values by equal-length index', () => {
    const current = [
      { period: '2026-08-01', value: 10 },
      { period: '2026-08-02', value: 20 },
    ];
    const previous = [
      { period: '2026-07-01', value: 5 },
      { period: '2026-07-02', value: 15 },
    ];
    expect(alignSeriesByIndex(current, previous)).toEqual([
      { period: '2026-08-01', value: 10, previousValue: 5 },
      { period: '2026-08-02', value: 20, previousValue: 15 },
    ]);
    expect(alignSeriesByIndex(current, null)).toEqual([
      { period: '2026-08-01', value: 10, previousValue: null },
      { period: '2026-08-02', value: 20, previousValue: null },
    ]);
  });
});
