import { AggregationService } from './aggregation.service';
import type {
  AggregationQuery,
  DataPoint,
  DataSeries,
  Kpi,
  ReportRecord,
} from './report.types';

export type DashboardMetricOperation = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface SeriesOptions {
  readonly name: string;
  readonly labelField: string;
  /** Required unless `operation` is `count`. */
  readonly valueField?: string;
  readonly operation?: DashboardMetricOperation;
}

export interface KpiOptions {
  readonly name: string;
  /** Required unless `operation` is `count`. */
  readonly field?: string;
  readonly operation?: DashboardMetricOperation;
  /** When supplied, the KPI also reports `previousValue`/`changePercent`. */
  readonly previousRecords?: readonly ReportRecord[];
}

/**
 * Builds chart-ready {@link DataSeries} and single-number {@link Kpi} values
 * from raw records, delegating all grouping/math to {@link AggregationService}.
 */
export class DashboardDataService {
  public constructor(
    private readonly aggregation: AggregationService = new AggregationService(),
  ) {}

  public buildSeries(
    records: readonly ReportRecord[],
    options: SeriesOptions,
  ): DataSeries {
    const operation = options.operation ?? 'sum';
    const query: AggregationQuery = {
      groupBy: [options.labelField],
      metrics: [
        {
          operation,
          field: this.fieldFor(operation, options.valueField, options.name),
          as: 'value',
        },
      ],
    };
    const results = this.aggregation.aggregate(records, query);
    const points: DataPoint[] = results.map((result) => ({
      label: this.toLabel(result.group[options.labelField]),
      value: result.metrics['value'],
    }));
    return { name: options.name, points };
  }

  public buildKpi(records: readonly ReportRecord[], options: KpiOptions): Kpi {
    const value = this.computeValue(records, options);
    if (options.previousRecords === undefined) {
      return { name: options.name, value };
    }
    const previousValue = this.computeValue(options.previousRecords, options);
    return {
      name: options.name,
      value,
      previousValue,
      changePercent: this.changePercent(value, previousValue),
    };
  }

  private computeValue(
    records: readonly ReportRecord[],
    options: KpiOptions,
  ): number {
    const operation = options.operation ?? 'count';
    if (operation === 'count') {
      return this.aggregation.count(records);
    }
    const field = this.fieldFor(operation, options.field, options.name);
    switch (operation) {
      case 'sum':
        return this.aggregation.sum(records, field);
      case 'avg':
        return this.aggregation.avg(records, field);
      case 'min':
        return this.aggregation.min(records, field);
      case 'max':
        return this.aggregation.max(records, field);
      default:
        throw new TypeError(`Unknown KPI operation "${String(operation)}"`);
    }
  }

  private fieldFor(
    operation: DashboardMetricOperation,
    field: string | undefined,
    name: string,
  ): string {
    if (operation === 'count') {
      return field ?? '';
    }
    if (!field) {
      throw new TypeError(
        `"${name}" requires a field for operation "${operation}"`,
      );
    }
    return field;
  }

  private toLabel(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return JSON.stringify(value);
  }

  private changePercent(value: number, previousValue: number): number {
    if (previousValue === 0) {
      return value === 0 ? 0 : 100;
    }
    return ((value - previousValue) / previousValue) * 100;
  }
}
