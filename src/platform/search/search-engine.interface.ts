export interface SearchDocument {
  readonly id: string;
  readonly [field: string]: unknown;
}

export interface SortClause {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

export interface SearchQuery {
  readonly index: string;
  readonly query: string;
  /** Restrict full-text matching to these fields. Defaults to all fields. */
  readonly fields?: readonly string[];
  /** Exact-match filters, ANDed together. */
  readonly filters?: Readonly<Record<string, unknown>>;
  /** Enable fuzzy / typo-tolerant matching. */
  readonly fuzzy?: boolean;
  readonly sort?: readonly SortClause[];
  readonly offset?: number;
  readonly limit?: number;
}

export interface SearchHit<T> {
  readonly item: T;
  readonly score: number;
}

export interface SearchResults<T> {
  readonly hits: readonly SearchHit<T>[];
  readonly total: number;
  readonly query: string;
}

export interface AutocompleteQuery {
  readonly index: string;
  readonly field: string;
  readonly prefix: string;
  readonly limit?: number;
}

export interface AutocompleteSuggestion {
  readonly text: string;
  readonly score: number;
}

/**
 * Search port. Platform ships in-memory, Postgres full-text-search, and
 * optional Elasticsearch/Meilisearch adapters selected via the
 * `SEARCH_ENGINE` configuration concept (postgres|elastic|meilisearch|memory).
 */
export interface SearchEngine {
  readonly name: string;
  index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void>;
  remove(index: string, id: string): Promise<boolean>;
  clear(index: string): Promise<void>;
  search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>>;
  autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]>;
}
