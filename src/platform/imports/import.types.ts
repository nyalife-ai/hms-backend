export type ImportJobStatus =
  | 'pending'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface ImportRowError {
  readonly row: number;
  readonly message: string;
  readonly data?: Readonly<Record<string, string>>;
}

export interface ImportJob {
  readonly id: string;
  readonly storageKey: string;
  readonly status: ImportJobStatus;
  readonly totalRows: number;
  readonly processedRows: number;
  readonly errorCount: number;
  readonly preview: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly errors: readonly ImportRowError[];
}

/** Returned immediately by {@link ImportService.startImport} — never blocks on row processing. */
export interface ImportSummary {
  readonly jobId: string;
  readonly totalRows: number;
  readonly status: ImportJobStatus;
}

export interface ImportRow {
  readonly index: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface RowValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
}

export interface RowValidator {
  validate(row: ImportRow): RowValidationResult | Promise<RowValidationResult>;
}

export interface DuplicateKeyExtractor {
  extractKey(row: ImportRow): string;
}

export interface RowProcessor {
  process(row: ImportRow): Promise<void>;
}

/** Rollback hook, invoked by {@link ImportService.rollback} to undo committed side-effects. */
export interface RollbackHook {
  rollback(jobId: string): Promise<void>;
}

export interface StartImportOptions {
  readonly fileName: string;
  readonly content: Buffer;
  /** Preview mode validates/counts rows but never invokes `onRow`. */
  readonly preview?: boolean;
  readonly validators?: readonly RowValidator[];
  readonly duplicateKey?: DuplicateKeyExtractor;
  readonly onRow?: RowProcessor;
  readonly rollback?: RollbackHook;
}
