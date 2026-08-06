import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchResults,
} from './search-engine.interface';
import { InMemorySearchEngine } from './adapters/in-memory.search';
import type { SearchEngineKind } from './search.tokens';

export class UnknownSearchEngineError extends Error {
  public constructor(reason: string) {
    super(
      `Unknown search engine "${reason}". Expected one of: postgres, elastic, meilisearch, memory.`,
    );
    this.name = 'UnknownSearchEngineError';
  }
}

export interface SearchEngineFactoryMap {
  readonly postgres?: () => SearchEngine;
  readonly elastic?: () => SearchEngine;
  readonly meilisearch?: () => SearchEngine;
}

/**
 * Resolves a {@link SearchEngine} from the `SEARCH_ENGINE` configuration
 * concept. `memory` always resolves to a fresh {@link InMemorySearchEngine};
 * the durable/external kinds require a factory because they depend on
 * externally supplied drivers (DB executor / HTTP client) that platform
 * cannot construct on its own.
 */
export function createSearchEngine(
  kind: SearchEngineKind,
  factories: SearchEngineFactoryMap = {},
): SearchEngine {
  switch (kind) {
    case 'memory':
      return new InMemorySearchEngine();
    case 'postgres':
      if (!factories.postgres) {
        throw new UnknownSearchEngineError('postgres (missing factory)');
      }
      return factories.postgres();
    case 'elastic':
      if (!factories.elastic) {
        throw new UnknownSearchEngineError('elastic (missing factory)');
      }
      return factories.elastic();
    case 'meilisearch':
      if (!factories.meilisearch) {
        throw new UnknownSearchEngineError('meilisearch (missing factory)');
      }
      return factories.meilisearch();
    default:
      throw new UnknownSearchEngineError(String(kind));
  }
}

/** Thin facade over an injected {@link SearchEngine}. */
export class SearchService {
  public constructor(private readonly engine: SearchEngine) {}

  public index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void> {
    return this.engine.index(index, documents);
  }

  public remove(index: string, id: string): Promise<boolean> {
    return this.engine.remove(index, id);
  }

  public clear(index: string): Promise<void> {
    return this.engine.clear(index);
  }

  public search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>> {
    return this.engine.search<T>(query);
  }

  public autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]> {
    return this.engine.autocomplete(query);
  }
}
