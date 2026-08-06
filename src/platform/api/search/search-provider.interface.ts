export interface SearchOptions {
  readonly fields?: readonly string[];
  readonly offset?: number;
  readonly limit?: number;
  readonly caseSensitive?: boolean;
}

export interface SearchResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly query: string;
}

export interface SearchProvider<T> {
  search(query: string, options?: SearchOptions): Promise<SearchResult<T>>;
}
