/**
 * Bulk import resource contract — one implementation per importable entity.
 */

export type BulkImportRowIssue = {
  readonly row: number;
  readonly message: string;
  readonly field?: string;
  readonly value?: string;
};

export type BulkImportNormalizedRow = Record<string, string | undefined>;

export type BulkImportValidateResult = {
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly warningRows: number;
  readonly errors: BulkImportRowIssue[];
  readonly warnings: BulkImportRowIssue[];
  /** Only valid rows — stored in session for commit. */
  readonly rows: BulkImportNormalizedRow[];
  /** Safe preview sample (no secrets). */
  readonly previewSample: BulkImportNormalizedRow[];
};

export type BulkImportCommitResult = {
  readonly imported: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errors: BulkImportRowIssue[];
  readonly createdIds: string[];
};

export interface BulkImportResource {
  readonly resourceKey: string;
  readonly displayName: string;
  /** Exact allowed CSV headers (order preserved for templates). */
  readonly headers: readonly string[];
  readonly requiredHeaders: readonly string[];
  buildTemplateCsv(): string;
  buildExampleCsv(): string;
  validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult>;
  commit(
    rows: BulkImportNormalizedRow[],
    actorUserId: string,
  ): Promise<BulkImportCommitResult>;
}
