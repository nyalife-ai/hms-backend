export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export type ReportRecord = Readonly<Record<string, unknown>>;

export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  readonly format?: (value: unknown, record: ReportRecord) => string;
}

export type AggregationOperation = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface AggregationMetric {
  /** Required for every operation except `count`. */
  readonly field?: string;
  readonly operation: AggregationOperation;
  /** Key the computed value is stored under in {@link AggregationResult.metrics}. */
  readonly as: string;
}

export interface AggregationQuery {
  readonly groupBy?: readonly string[];
  readonly metrics: readonly AggregationMetric[];
}

export type AggregationGroupKey = Readonly<Record<string, unknown>>;

export interface AggregationResult {
  readonly group: AggregationGroupKey;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface DataPoint {
  readonly label: string;
  readonly value: number;
}

export interface DataSeries {
  readonly name: string;
  readonly points: readonly DataPoint[];
}

export interface Kpi {
  readonly name: string;
  readonly value: number;
  readonly previousValue?: number;
  readonly changePercent?: number;
}

export type ReportRunStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ReportRunResult {
  readonly reportId: string;
  readonly format: ReportFormat;
  readonly status: ReportRunStatus;
  readonly storageKey?: string;
  readonly generatedAt: Date;
}
