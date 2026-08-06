import type {
  AggregationGroupKey,
  AggregationMetric,
  AggregationQuery,
  AggregationResult,
  ReportRecord,
} from './report.types';

/**
 * Generic groupBy/sum/count/avg/min/max over arbitrary record arrays. No
 * business vocabulary — callers (business reports, dashboards) supply field
 * names and interpret the results.
 */
export class AggregationService {
  public groupBy(
    records: readonly ReportRecord[],
    keys: readonly string[],
  ): ReadonlyMap<string, readonly ReportRecord[]> {
    const groups = new Map<string, ReportRecord[]>();
    for (const record of records) {
      const groupKey = this.groupKeyOf(record, keys);
      const bucket = groups.get(groupKey);
      if (bucket) {
        bucket.push(record);
      } else {
        groups.set(groupKey, [record]);
      }
    }
    return groups;
  }

  public sum(records: readonly ReportRecord[], field: string): number {
    return records.reduce(
      (total, record) => total + this.numeric(record[field]),
      0,
    );
  }

  public count(records: readonly ReportRecord[]): number {
    return records.length;
  }

  public avg(records: readonly ReportRecord[], field: string): number {
    return records.length === 0 ? 0 : this.sum(records, field) / records.length;
  }

  public min(records: readonly ReportRecord[], field: string): number {
    if (records.length === 0) {
      return 0;
    }
    return records.reduce(
      (currentMin, record) => Math.min(currentMin, this.numeric(record[field])),
      Number.POSITIVE_INFINITY,
    );
  }

  public max(records: readonly ReportRecord[], field: string): number {
    if (records.length === 0) {
      return 0;
    }
    return records.reduce(
      (currentMax, record) => Math.max(currentMax, this.numeric(record[field])),
      Number.NEGATIVE_INFINITY,
    );
  }

  /** Runs a full aggregation query: optional grouping plus one or more metrics. */
  public aggregate(
    records: readonly ReportRecord[],
    query: AggregationQuery,
  ): readonly AggregationResult[] {
    const groupKeys = query.groupBy ?? [];
    const groups =
      groupKeys.length === 0
        ? new Map<string, readonly ReportRecord[]>([['', records]])
        : this.groupBy(records, groupKeys);

    return [...groups.values()].map((groupRecords) => ({
      group: this.groupOf(groupRecords[0], groupKeys),
      metrics: this.computeMetrics(groupRecords, query.metrics),
    }));
  }

  private computeMetrics(
    records: readonly ReportRecord[],
    metrics: readonly AggregationMetric[],
  ): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const metric of metrics) {
      result[metric.as] = this.computeMetric(records, metric);
    }
    return result;
  }

  private computeMetric(
    records: readonly ReportRecord[],
    metric: AggregationMetric,
  ): number {
    switch (metric.operation) {
      case 'count':
        return this.count(records);
      case 'sum':
        return this.sum(records, this.requireField(metric));
      case 'avg':
        return this.avg(records, this.requireField(metric));
      case 'min':
        return this.min(records, this.requireField(metric));
      case 'max':
        return this.max(records, this.requireField(metric));
      default:
        throw new TypeError(
          `Unknown aggregation operation "${String(metric.operation)}"`,
        );
    }
  }

  private requireField(metric: AggregationMetric): string {
    if (!metric.field) {
      throw new TypeError(`Aggregation metric "${metric.as}" requires a field`);
    }
    return metric.field;
  }

  private groupKeyOf(record: ReportRecord, keys: readonly string[]): string {
    return JSON.stringify(keys.map((key) => record[key] ?? null));
  }

  private groupOf(
    record: ReportRecord | undefined,
    keys: readonly string[],
  ): AggregationGroupKey {
    const group: Record<string, unknown> = {};
    for (const key of keys) {
      group[key] = record?.[key];
    }
    return group;
  }

  private numeric(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
