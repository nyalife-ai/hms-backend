import type { ReportColumn, ReportRecord } from './report.types';

export type ReportQueryParams = Readonly<Record<string, unknown>>;

/** Supplies the raw rows a report renders. Never touches PDF/Excel/CSV concerns. */
export interface ReportDataSource<
  TParams extends ReportQueryParams = ReportQueryParams,
> {
  fetch(
    params: TParams,
  ): Promise<readonly ReportRecord[]> | readonly ReportRecord[];
}

/**
 * Declarative description of a report: what data it fetches and how columns
 * are labeled for export. Rendering (PDF/DOCX/CSV/XLSX) is always delegated
 * to an injected export port — a definition never knows how to render
 * itself, matching the "compose Document/Storage/Queue via ports" mandate.
 */
export interface ReportDefinition<
  TParams extends ReportQueryParams = ReportQueryParams,
> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly columns?: readonly ReportColumn[];
  readonly dataSource: ReportDataSource<TParams>;
}

/** Validates a report definition's identity before registering it. */
export function defineReport<
  TParams extends ReportQueryParams = ReportQueryParams,
>(definition: ReportDefinition<TParams>): ReportDefinition<TParams> {
  if (definition.id.trim().length === 0) {
    throw new TypeError('Report definition id cannot be empty');
  }
  return definition;
}
