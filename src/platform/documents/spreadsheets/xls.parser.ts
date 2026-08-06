import type {
  SpreadsheetParser,
  SpreadsheetWorkbook,
} from '../interfaces/spreadsheet-parser.interface';
import { UnsupportedDocumentFormatException } from '../documents.exceptions';

/**
 * Legacy binary XLS (`.xls`, OLE2/CFB format) is a different container from
 * XLSX and is not supported by `exceljs`. Rather than pull in a dedicated
 * CFB/BIFF parser for a rarely-used legacy format, this scaffold fails fast
 * with a clear, actionable message: convert to XLSX/CSV first.
 */
export class XlsParser implements SpreadsheetParser {
  public readonly format = 'xls';

  public parse(): Promise<SpreadsheetWorkbook> {
    return Promise.reject(
      new UnsupportedDocumentFormatException(
        'xls',
        'Legacy XLS (BIFF/OLE2) parsing is not supported. Convert the file to XLSX or CSV before importing.',
      ),
    );
  }
}
