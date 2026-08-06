import type {
  SpreadsheetCellValue,
  SpreadsheetParser,
  SpreadsheetWorkbook,
} from '../interfaces/spreadsheet-parser.interface';
import type { ModuleResolver } from '../optional-driver';
import { loadDriver } from '../optional-driver';

/** Narrow structural shape of the parts of `exceljs` this parser depends on. */
export interface ExceljsRowLike {
  readonly values: readonly unknown[];
}
export interface ExceljsWorksheetLike {
  readonly name: string;
  eachRow(callback: (row: ExceljsRowLike, rowNumber: number) => void): void;
}
export interface ExceljsWorkbookLike {
  readonly worksheets: readonly ExceljsWorksheetLike[];
  readonly xlsx: { load(buffer: Buffer): Promise<unknown> };
}
export interface ExceljsModule {
  readonly Workbook: new () => ExceljsWorkbookLike;
}

/**
 * XLSX parser backed by the optional `exceljs` driver. Throws
 * {@link import('../optional-driver').MissingDriverError} with an actionable
 * message ("yarn add exceljs") when the driver is not installed — the
 * scaffold itself never requires `exceljs` to be present.
 */
export class XlsxParser implements SpreadsheetParser {
  public readonly format = 'xlsx';

  public constructor(private readonly resolver?: ModuleResolver) {}

  public async parse(input: Buffer | string): Promise<SpreadsheetWorkbook> {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    const exceljs = loadDriver<ExceljsModule>('exceljs', this.resolver);
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.load(buffer);
    return {
      sheets: workbook.worksheets.map((worksheet) => ({
        name: worksheet.name,
        rows: this.collectRows(worksheet),
      })),
    };
  }

  private collectRows(
    worksheet: ExceljsWorksheetLike,
  ): SpreadsheetCellValue[][] {
    const rows: SpreadsheetCellValue[][] = [];
    worksheet.eachRow((row) => {
      rows.push(row.values.slice(1).map((value) => this.normalizeCell(value)));
    });
    return rows;
  }

  private normalizeCell(value: unknown): SpreadsheetCellValue {
    if (value === null || value === undefined) {
      return null;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'string' ||
      value instanceof Date
    ) {
      return value;
    }
    // exceljs may hand back rich objects (hyperlinks, formulas, rich text)
    // whose `toString` implementation is the meaningful cell rendering.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
  }
}
