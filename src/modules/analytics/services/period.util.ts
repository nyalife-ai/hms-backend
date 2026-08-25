/**
 * Analytics period helpers — presets, previous-period of equal length, change %.
 */

export type AnalyticsPreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_180_days'
  | 'last_365_days'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export type AnalyticsCompare =
  | 'none'
  | 'previous_period'
  | 'previous_month'
  | 'previous_year';

export type AnalyticsGranularity =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  compareFrom: Date | null;
  compareTo: Date | null;
  granularity: AnalyticsGranularity;
  preset: AnalyticsPreset;
  compare: AnalyticsCompare;
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1, 0, 0, 0, 0);
}

function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) throw new Error(`Invalid date: ${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolvePeriod(input: {
  preset?: AnalyticsPreset;
  from?: string;
  to?: string;
  compare?: AnalyticsCompare;
  granularity?: AnalyticsGranularity;
  now?: Date;
}): ResolvedPeriod {
  const now = input.now ?? new Date();
  const preset = input.preset ?? (input.from && input.to ? 'custom' : 'last_30_days');
  const compare = input.compare ?? 'previous_period';

  let from: Date;
  let to: Date;

  switch (preset) {
    case 'today':
      from = startOfDay(now);
      to = endOfDay(now);
      break;
    case 'yesterday': {
      const y = addDays(now, -1);
      from = startOfDay(y);
      to = endOfDay(y);
      break;
    }
    case 'last_7_days':
      from = startOfDay(addDays(now, -6));
      to = endOfDay(now);
      break;
    case 'last_30_days':
      from = startOfDay(addDays(now, -29));
      to = endOfDay(now);
      break;
    case 'last_90_days':
      from = startOfDay(addDays(now, -89));
      to = endOfDay(now);
      break;
    case 'last_180_days':
      from = startOfDay(addDays(now, -179));
      to = endOfDay(now);
      break;
    case 'last_365_days':
      from = startOfDay(addDays(now, -364));
      to = endOfDay(now);
      break;
    case 'this_week':
      from = startOfWeek(now);
      to = endOfDay(now);
      break;
    case 'last_week': {
      const start = startOfWeek(addDays(now, -7));
      from = start;
      to = endOfDay(addDays(start, 6));
      break;
    }
    case 'this_month':
      from = startOfMonth(now);
      to = endOfDay(now);
      break;
    case 'last_month': {
      const first = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      from = first;
      to = endOfMonth(first);
      break;
    }
    case 'this_quarter':
      from = startOfQuarter(now);
      to = endOfDay(now);
      break;
    case 'this_year':
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      to = endOfDay(now);
      break;
    case 'last_year':
      from = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      to = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
      break;
    case 'custom':
    default:
      from = startOfDay(parseYmd(input.from ?? toYmd(addDays(now, -29))));
      to = endOfDay(parseYmd(input.to ?? toYmd(now)));
      break;
  }

  if (from > to) {
    const tmp = from;
    from = startOfDay(to);
    to = endOfDay(tmp);
  }

  let compareFrom: Date | null = null;
  let compareTo: Date | null = null;

  if (compare === 'previous_period') {
    const ms = to.getTime() - from.getTime();
    compareTo = new Date(from.getTime() - 1);
    compareFrom = new Date(compareTo.getTime() - ms);
    compareFrom = startOfDay(compareFrom);
    compareTo = endOfDay(compareTo);
  } else if (compare === 'previous_month') {
    const lenDays =
      Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
    const anchor = new Date(from.getFullYear(), from.getMonth() - 1, from.getDate());
    compareFrom = startOfDay(anchor);
    compareTo = endOfDay(addDays(compareFrom, lenDays - 1));
  } else if (compare === 'previous_year') {
    compareFrom = startOfDay(
      new Date(from.getFullYear() - 1, from.getMonth(), from.getDate()),
    );
    compareTo = endOfDay(
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate()),
    );
  }

  const daySpan =
    Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
  let granularity: AnalyticsGranularity =
    input.granularity ??
    (daySpan <= 14
      ? 'day'
      : daySpan <= 90
        ? 'day'
        : daySpan <= 370
          ? 'month'
          : 'year');

  if (!input.granularity && daySpan > 45 && daySpan <= 90) {
    granularity = 'week';
  }

  return {
    from,
    to,
    compareFrom,
    compareTo,
    granularity,
    preset,
    compare,
  };
}

/** Safe percent change — never Infinity. null when not meaningful. */
export function changePercent(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function bucketKey(d: Date, granularity: AnalyticsGranularity): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (granularity === 'day') return `${y}-${m}-${day}`;
  if (granularity === 'week') {
    const start = startOfWeek(d);
    return `W${toYmd(start)}`;
  }
  if (granularity === 'month') return `${y}-${m}`;
  if (granularity === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${y}-Q${q}`;
  }
  return String(y);
}

export function enumerateBuckets(
  from: Date,
  to: Date,
  granularity: AnalyticsGranularity,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor <= end) {
    const k = bucketKey(cursor, granularity);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    if (granularity === 'day') cursor = addDays(cursor, 1);
    else if (granularity === 'week') cursor = addDays(cursor, 7);
    else if (granularity === 'month')
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    else if (granularity === 'quarter')
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
    else cursor = new Date(cursor.getFullYear() + 1, 0, 1);
  }
  return keys;
}

/** Map previous-period bucket values onto current points by equal-length index. */
export function alignSeriesByIndex(
  current: Array<{ period: string; value: number }>,
  previous: Array<{ period: string; value: number }> | null,
): Array<{ period: string; value: number; previousValue: number | null }> {
  return current.map((p, i) => ({
    period: p.period,
    value: p.value,
    previousValue: previous ? (previous[i]?.value ?? null) : null,
  }));
}
