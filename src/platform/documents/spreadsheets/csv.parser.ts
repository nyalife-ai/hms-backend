import type {
  SpreadsheetCellValue,
  SpreadsheetParser,
  SpreadsheetWorkbook,
  SpreadsheetWriter,
} from '../interfaces/spreadsheet-parser.interface';
import { stringifyValue } from '../markup-escape.util';

export interface CsvParserOptions {
  readonly delimiter?: string;
  readonly sheetName?: string;
}

/**
 * Dependency-free CSV reader/writer (RFC 4180-ish: quoted fields, escaped
 * `""`, `\r\n`/`\n` line endings, configurable delimiter). No `papaparse`
 * required.
 */
export class CsvParser implements SpreadsheetParser, SpreadsheetWriter {
  public readonly format = 'csv';
  private readonly delimiter: string;
  private readonly sheetName: string;

  public constructor(options: CsvParserOptions = {}) {
    this.delimiter = options.delimiter ?? ',';
    this.sheetName = options.sheetName ?? 'Sheet1';
  }

  public parse(input: Buffer | string): Promise<SpreadsheetWorkbook> {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    return Promise.resolve({
      sheets: [{ name: this.sheetName, rows: this.parseRows(text) }],
    });
  }

  public write(workbook: SpreadsheetWorkbook): Promise<Buffer> {
    const sheet = workbook.sheets[0];
    const rows = sheet ? sheet.rows : [];
    const text = rows
      .map((row) =>
        row.map((cell) => this.formatCell(cell)).join(this.delimiter),
      )
      .join('\r\n');
    return Promise.resolve(Buffer.from(text, 'utf8'));
  }

  private parseRows(text: string): SpreadsheetCellValue[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let index = 0;

    const pushField = (): void => {
      row.push(field);
      field = '';
    };
    const pushRow = (): void => {
      pushField();
      rows.push(row);
      row = [];
    };

    while (index < text.length) {
      const character = text[index];
      if (inQuotes) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 2;
            continue;
          }
          inQuotes = false;
          index += 1;
          continue;
        }
        field += character;
        index += 1;
        continue;
      }
      if (character === '"') {
        inQuotes = true;
        index += 1;
        continue;
      }
      if (character === this.delimiter) {
        pushField();
        index += 1;
        continue;
      }
      if (character === '\r') {
        index += 1;
        continue;
      }
      if (character === '\n') {
        pushRow();
        index += 1;
        continue;
      }
      field += character;
      index += 1;
    }
    if (field.length > 0 || row.length > 0) {
      pushRow();
    }
    return rows;
  }

  private formatCell(value: SpreadsheetCellValue): string {
    const text = stringifyValue(value);
    if (
      text.includes(this.delimiter) ||
      text.includes('"') ||
      text.includes('\n') ||
      text.includes('\r')
    ) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
