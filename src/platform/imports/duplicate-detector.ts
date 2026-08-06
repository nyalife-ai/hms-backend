import type { DuplicateKeyExtractor, ImportRow } from './import.types';

/** Tracks keys seen so far within a single import run to flag duplicate rows. */
export class DuplicateDetector {
  private readonly seen = new Set<string>();

  public constructor(private readonly extractor: DuplicateKeyExtractor) {}

  /** Returns `true` when this row's key has already been seen (and records it either way). */
  public check(row: ImportRow): boolean {
    const key = this.extractor.extractKey(row);
    if (this.seen.has(key)) {
      return true;
    }
    this.seen.add(key);
    return false;
  }

  public reset(): void {
    this.seen.clear();
  }
}

/** Extractor factory: deduplicates rows by the value of a single column. */
export function columnDuplicateKeyExtractor(
  column: string,
): DuplicateKeyExtractor {
  return {
    extractKey: (row: ImportRow) => row.values[column] ?? '',
  };
}
