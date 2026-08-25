/**
 * Dashboard calendar month-range helper — ensures scoped fetches, not all-time.
 */

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthRange(year: number, monthIndex: number) {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from: ymd(from), to: ymd(to) };
}

function dayMarkers(
  appointments: Array<{ date: string }>,
  followUps: Array<{ followUpDate: string }>,
  year: number,
  monthIndex: number,
) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const apptDays = new Set<number>();
  const followDays = new Set<number>();
  for (const a of appointments) {
    if (a.date.startsWith(prefix)) apptDays.add(Number(a.date.slice(8, 10)));
  }
  for (const f of followUps) {
    const date = f.followUpDate.slice(0, 10);
    if (date.startsWith(prefix)) followDays.add(Number(date.slice(8, 10)));
  }
  return { apptDays, followDays };
}

describe('dashboard calendar month scoping', () => {
  it('builds inclusive month from/to for API queries', () => {
    expect(monthRange(2026, 7)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('highlights only days with appointments or follow-ups in the visible month', () => {
    const { apptDays, followDays } = dayMarkers(
      [
        { date: '2026-08-25' },
        { date: '2026-08-25' },
        { date: '2026-07-31' },
      ],
      [{ followUpDate: '2026-08-10T00:00:00.000Z' }, { followUpDate: '2026-09-01' }],
      2026,
      7,
    );
    expect([...apptDays]).toEqual([25]);
    expect([...followDays]).toEqual([10]);
  });
});
