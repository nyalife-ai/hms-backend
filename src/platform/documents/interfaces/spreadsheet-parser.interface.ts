export const SPREADSHEET_PARSER = Symbol('SPREADSHEET_PARSER');
export const SPREADSHEET_WRITER = Symbol('SPREADSHEET_WRITER');

export type SpreadsheetCellValue = string | number | boolean | Date | null;

export interface SpreadsheetSheet {
  readonly name: string;
  readonly rows: ReadonlyArray<ReadonlyArray<SpreadsheetCellValue>>;
}

export interface SpreadsheetWorkbook {
  readonly sheets: readonly SpreadsheetSheet[];
}

/** Reads a spreadsheet-like format (CSV, XLSX, XLS, ODS, ...) into a generic workbook. */
export interface SpreadsheetParser {
  readonly format: string;
  parse(input: Buffer | string): Promise<SpreadsheetWorkbook>;
}

/** Serializes a generic workbook into a spreadsheet-like format. */
export interface SpreadsheetWriter {
  readonly format: string;
  write(workbook: SpreadsheetWorkbook): Promise<Buffer>;
}
