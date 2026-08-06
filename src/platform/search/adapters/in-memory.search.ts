import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  SearchDocument,
  SearchEngine,
  SearchHit,
  SearchQuery,
  SearchResults,
} from '../search-engine.interface';

interface StoredDocument<T extends SearchDocument> {
  readonly document: T;
  readonly tokens: readonly string[];
}

/**
 * Process-local search engine backed by naive tokenization, term-frequency
 * ranking, and optional Levenshtein-distance fuzzy matching. Suitable for
 * tests and small datasets; not durable across restarts.
 */
export class InMemorySearchEngine implements SearchEngine {
  public readonly name = 'memory';
  private readonly indices = new Map<
    string,
    Map<string, StoredDocument<SearchDocument>>
  >();

  public index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void> {
    const store = this.getOrCreateIndex(index);
    for (const document of documents) {
      store.set(document.id, {
        document,
        tokens: tokenize(flattenValues(document)),
      });
    }
    return Promise.resolve();
  }

  public remove(index: string, id: string): Promise<boolean> {
    const store = this.indices.get(index);
    if (!store) {
      return Promise.resolve(false);
    }
    return Promise.resolve(store.delete(id));
  }

  public clear(index: string): Promise<void> {
    this.indices.delete(index);
    return Promise.resolve();
  }

  public search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>> {
    const store = this.indices.get(query.index);
    const terms = tokenize(query.query);
    const hits: SearchHit<T>[] = [];
    if (store) {
      for (const stored of store.values()) {
        if (!matchesFilters(stored.document, query.filters)) {
          continue;
        }
        const score = scoreDocument(
          stored,
          terms,
          query.fuzzy ?? false,
          query.fields,
        );
        if (score > 0) {
          hits.push({ item: stored.document as T, score });
        }
      }
    }
    hits.sort((left, right) => right.score - left.score);
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = Math.max(0, Math.floor(query.limit ?? hits.length));
    return Promise.resolve({
      hits: hits.slice(offset, offset + limit),
      total: hits.length,
      query: query.query,
    });
  }

  public autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]> {
    const store = this.indices.get(query.index);
    if (!store) {
      return Promise.resolve([]);
    }
    const prefix = query.prefix.toLocaleLowerCase();
    const counts = new Map<string, number>();
    for (const stored of store.values()) {
      const raw = stored.document[query.field];
      if (typeof raw !== 'string') {
        continue;
      }
      for (const token of tokenize(raw)) {
        if (token.startsWith(prefix)) {
          counts.set(token, (counts.get(token) ?? 0) + 1);
        }
      }
    }
    const limit = Math.max(0, Math.floor(query.limit ?? 10));
    return Promise.resolve(
      [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([text, score]) => ({ text, score })),
    );
  }

  private getOrCreateIndex(
    index: string,
  ): Map<string, StoredDocument<SearchDocument>> {
    let store = this.indices.get(index);
    if (!store) {
      store = new Map();
      this.indices.set(index, store);
    }
    return store;
  }
}

function tokenize(value: string): readonly string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function flattenValues(document: SearchDocument): string {
  return Object.values(document)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ');
}

function matchesFilters(
  document: SearchDocument,
  filters: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!filters) {
    return true;
  }
  return Object.entries(filters).every(
    ([key, value]) => document[key] === value,
  );
}

function pickFields(
  document: SearchDocument,
  fields: readonly string[],
): SearchDocument {
  const picked: Record<string, unknown> = { id: document.id };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(document, field)) {
      picked[field] = document[field];
    }
  }
  return picked as SearchDocument;
}

function scoreDocument<T extends SearchDocument>(
  stored: StoredDocument<T>,
  terms: readonly string[],
  fuzzy: boolean,
  fields: readonly string[] | undefined,
): number {
  if (terms.length === 0) {
    return 1;
  }
  const haystack = fields
    ? tokenize(flattenValues(pickFields(stored.document, fields)))
    : stored.tokens;
  let score = 0;
  for (const term of terms) {
    for (const token of haystack) {
      if (token === term) {
        score += 3;
      } else if (token.startsWith(term)) {
        score += 2;
      } else if (fuzzy && levenshtein(token, term) <= fuzzyThreshold(term)) {
        score += 1;
      }
    }
  }
  return score;
}

function fuzzyThreshold(term: string): number {
  return term.length <= 4 ? 1 : 2;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}
