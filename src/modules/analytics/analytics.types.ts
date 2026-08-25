/**
 * Shared analytics response types + builders.
 */

export type AnalyticsKpi = {
  key: string;
  label: string;
  value: number;
  previousValue?: number | null;
  changePercent?: number | null;
  unit: 'count' | 'currency' | 'percent' | 'hours' | 'days';
  definition: string;
  hasData: boolean;
};

export type AnalyticsSeriesPoint = {
  period: string;
  value: number;
  previousValue?: number | null;
};

export type AnalyticsSeries = {
  key: string;
  label: string;
  points: AnalyticsSeriesPoint[];
  hasData: boolean;
};

export type AnalyticsBreakdownRow = {
  name: string;
  value: number;
  pct?: number | null;
  changePercent?: number | null;
};

export type AnalyticsBreakdown = {
  key: string;
  label: string;
  rows: AnalyticsBreakdownRow[];
  hasData: boolean;
};

export type AnalyticsTable = {
  key: string;
  label: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  hasData: boolean;
};

export type AnalyticsMeta = {
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  granularity: string;
  preset: string;
  compare: string;
  generatedAt: string;
  currency: 'KES';
  domain: string;
  /** Present on overview when response is role-scoped */
  overviewScope?: string;
};

export type AnalyticsPayload = {
  meta: AnalyticsMeta;
  kpis: AnalyticsKpi[];
  series: AnalyticsSeries[];
  breakdowns: AnalyticsBreakdown[];
  tables: AnalyticsTable[];
};

export function kpi(input: {
  key: string;
  label: string;
  value: number;
  previousValue?: number | null;
  changePercent?: number | null;
  unit: AnalyticsKpi['unit'];
  definition: string;
  hasData?: boolean;
}): AnalyticsKpi {
  return {
    ...input,
    hasData: input.hasData ?? true,
  };
}

export function series(input: {
  key: string;
  label: string;
  points: AnalyticsSeriesPoint[];
}): AnalyticsSeries {
  const hasData = input.points.some((p) => p.value !== 0 || (p.previousValue ?? 0) !== 0);
  return { ...input, hasData };
}

export function breakdown(input: {
  key: string;
  label: string;
  rows: AnalyticsBreakdownRow[];
}): AnalyticsBreakdown {
  const total = input.rows.reduce((s, r) => s + r.value, 0);
  const rows = input.rows.map((r) => ({
    ...r,
    pct: total > 0 ? Math.round((r.value / total) * 1000) / 10 : null,
  }));
  return {
    key: input.key,
    label: input.label,
    rows,
    hasData: rows.length > 0 && total > 0,
  };
}

export function table(input: {
  key: string;
  label: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
}): AnalyticsTable {
  return {
    ...input,
    hasData: input.rows.length > 0,
  };
}

export function dec(n: unknown): number {
  if (n === null || n === undefined) return 0;
  if (typeof n === 'number') return n;
  if (typeof n === 'bigint') return Number(n);
  if (typeof n === 'object' && n !== null && 'toNumber' in n) {
    return (n as { toNumber: () => number }).toNumber();
  }
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}
