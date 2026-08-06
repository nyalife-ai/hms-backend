import type {
  SpreadsheetWorkbook,
  SpreadsheetWriter,
} from '../interfaces/spreadsheet-parser.interface';
import type { ModuleResolver } from '../optional-driver';
import { loadDriver } from '../optional-driver';

export interface ExceljsWorksheetWriterLike {
  addRow(values: readonly unknown[]): void;
}
export interface ExceljsWorkbookWriterLike {
  addWorksheet(name: string): ExceljsWorksheetWriterLike;
  readonly xlsx: { writeBuffer(): Promise<Buffer> };
}
export interface ExceljsWriterModule {
  readonly Workbook: new () => ExceljsWorkbookWriterLike;
}

/** XLSX writer backed by the optional `exceljs` driver. */
export class XlsxWriter implements SpreadsheetWriter {
  public readonly format = 'xlsx';

  public constructor(private readonly resolver?: ModuleResolver) {}

  public async write(workbook: SpreadsheetWorkbook): Promise<Buffer> {
    const exceljs = loadDriver<ExceljsWriterModule>('exceljs', this.resolver);
    const output = new exceljs.Workbook();
    for (const sheet of workbook.sheets) {
      const worksheet = output.addWorksheet(sheet.name);
      for (const row of sheet.rows) {
        worksheet.addRow([...row]);
      }
    }
    return output.xlsx.writeBuffer();
  }
}

/**
 * Spreadsheet writer that needs no external driver — serializes the
 * generic workbook model as JSON. Used as a dependency-free fallback (and
 * for tests) when `exceljs` is unavailable.
 *
 * No custom replacer is needed for `Date` values: `Date.prototype.toJSON`
 * already converts them to ISO strings before `JSON.stringify` ever sees
 * them.
 */
export class JsonSpreadsheetWriter implements SpreadsheetWriter {
  public readonly format = 'json';

  public write(workbook: SpreadsheetWorkbook): Promise<Buffer> {
    return Promise.resolve(Buffer.from(JSON.stringify(workbook), 'utf8'));
  }
}
