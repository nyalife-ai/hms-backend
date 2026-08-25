/**
 * Analytics payload helpers — empty / hasData flags used by UI empty states.
 */

import { breakdown, series, table } from '../analytics.types';

describe('analytics.types helpers', () => {
  it('marks empty series and breakdowns without data', () => {
    expect(
      series({
        key: 'patients.registrations',
        label: 'Registrations',
        points: [
          { period: '2026-08-01', value: 0 },
          { period: '2026-08-02', value: 0 },
        ],
      }).hasData,
    ).toBe(false);

    expect(
      series({
        key: 'patients.registrations',
        label: 'Registrations',
        points: [{ period: '2026-08-01', value: 3 }],
      }).hasData,
    ).toBe(true);

    expect(
      breakdown({
        key: 'patients.by_gender',
        label: 'Gender',
        rows: [],
      }).hasData,
    ).toBe(false);

    expect(
      breakdown({
        key: 'patients.by_gender',
        label: 'Gender',
        rows: [{ name: 'Female', value: 2 }],
      }).hasData,
    ).toBe(true);
  });

  it('marks empty tables', () => {
    expect(
      table({
        key: 't',
        label: 'T',
        columns: ['A'],
        rows: [],
      }).hasData,
    ).toBe(false);
    expect(
      table({
        key: 't',
        label: 'T',
        columns: ['A'],
        rows: [{ A: 1 }],
      }).hasData,
    ).toBe(true);
  });
});
