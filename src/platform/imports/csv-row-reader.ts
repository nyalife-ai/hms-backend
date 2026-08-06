import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ImportRow } from './import.types';

export class CsvFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

export interface CsvReadOptions {
  /** Column delimiter. Defaults to `,`. */
  readonly delimiter?: string;
}

/**
 * Parses one CSV line into cells, honouring double-quoted fields (including
 * embedded delimiters and escaped `""` quotes). Does not handle embedded
 * newlines within quoted fields — this is a line-oriented streaming reader.
 */
function parseCsvLine(line: string, delimiter: string): readonly string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Streams CSV rows from a Node.js `Readable`, treating the first
 * non-blank line as the header row. Node-only (uses `node:readline`).
 *
 * @throws {CsvFormatError} when a data row's column count does not match
 * the header.
 */
export async function* readCsvRows(
  source: Readable,
  options: CsvReadOptions = {},
): AsyncGenerator<ImportRow> {
  const delimiter = options.delimiter ?? ',';
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  let headers: readonly string[] | undefined;
  let index = 0;
  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const cells = parseCsvLine(line, delimiter);
    if (!headers) {
      headers = cells;
      continue;
    }
    if (cells.length !== headers.length) {
      throw new CsvFormatError(
        `Row ${index} has ${cells.length} columns, expected ${headers.length}`,
      );
    }
    const values: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      values[header] = cells[cellIndex];
    });
    yield { index, values };
    index += 1;
  }
}

/** Convenience wrapper for in-memory buffers (typical after a storage upload). */
export function readCsvRowsFromBuffer(
  content: Buffer,
  options: CsvReadOptions = {},
): AsyncGenerator<ImportRow> {
  return readCsvRows(Readable.from(content.toString('utf8')), options);
}

/** Counts data rows without materializing them, for `totalRows` reporting. */
export async function countCsvRows(
  content: Buffer,
  options: CsvReadOptions = {},
): Promise<number> {
  let count = 0;
  for await (const row of readCsvRowsFromBuffer(content, options)) {
    void row;
    count += 1;
  }
  return count;
}
