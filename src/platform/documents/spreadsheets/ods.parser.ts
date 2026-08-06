import type {
  SpreadsheetParser,
  SpreadsheetWorkbook,
} from '../interfaces/spreadsheet-parser.interface';
import { UnsupportedDocumentFormatException } from '../documents.exceptions';

/**
 * OpenDocument Spreadsheet (`.ods`) is a zipped `content.xml` package with
 * its own schema (`table:table`, `table:table-row`, ...). Parsing it
 * correctly needs a real zip+XML implementation, which is out of scope for
 * this generic scaffold. Fails fast with a clear, actionable message:
 * convert to XLSX/CSV first.
 */
export class OdsParser implements SpreadsheetParser {
  public readonly format = 'ods';

  public parse(): Promise<SpreadsheetWorkbook> {
    return Promise.reject(
      new UnsupportedDocumentFormatException(
        'ods',
        'OpenDocument Spreadsheet parsing is not supported. Export to XLSX or CSV before importing.',
      ),
    );
  }
}
