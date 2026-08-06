import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchResults,
} from '../search-engine.interface';
import type { HttpJsonClient } from './elasticsearch.search';

export interface MeilisearchOptions {
  readonly baseUrl: string;
}

export class MeilisearchRequestError extends Error {}

interface MeilisearchSearchResponse<T> {
  readonly hits: readonly T[];
  readonly estimatedTotalHits?: number;
  readonly totalHits?: number;
}

/**
 * Meilisearch adapter driven purely through its HTTP REST API via an
 * injected {@link HttpJsonClient}. Optional in the sense that no npm client
 * package is required.
 */
export class MeilisearchSearchEngine implements SearchEngine {
  public readonly name = 'meilisearch';

  public constructor(
    private readonly client: HttpJsonClient,
    private readonly options: MeilisearchOptions,
  ) {}

  public async index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void> {
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/indexes/${index}/documents`),
      body: documents,
    });
    this.assertOk(response.status, 'add documents');
  }

  public async remove(index: string, id: string): Promise<boolean> {
    const response = await this.client.request({
      method: 'DELETE',
      url: this.url(`/indexes/${index}/documents/${id}`),
    });
    if (response.status === 404) {
      return false;
    }
    this.assertOk(response.status, 'delete document');
    return true;
  }

  public async clear(index: string): Promise<void> {
    const response = await this.client.request({
      method: 'DELETE',
      url: this.url(`/indexes/${index}/documents`),
    });
    this.assertOk(response.status, 'clear index');
  }

  public async search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>> {
    const body: Record<string, unknown> = {
      q: query.query,
      offset: query.offset ?? 0,
      limit: query.limit ?? 20,
      ...(query.fields ? { attributesToSearchOn: query.fields } : {}),
      ...(query.filters
        ? {
            filter: Object.entries(query.filters).map(
              ([field, value]) => `${field} = ${JSON.stringify(value)}`,
            ),
          }
        : {}),
    };
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/indexes/${query.index}/search`),
      body,
    });
    this.assertOk(response.status, 'search');
    const payload = response.body as MeilisearchSearchResponse<T>;
    return {
      hits: payload.hits.map((item) => ({ item, score: 1 })),
      total:
        payload.estimatedTotalHits ?? payload.totalHits ?? payload.hits.length,
      query: query.query,
    };
  }

  public async autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]> {
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/indexes/${query.index}/search`),
      body: {
        q: query.prefix,
        attributesToSearchOn: [query.field],
        limit: query.limit ?? 10,
      },
    });
    this.assertOk(response.status, 'autocomplete');
    const payload = response.body as {
      hits: readonly Record<string, unknown>[];
    };
    return payload.hits
      .map((hit) => hit[query.field])
      .filter((value): value is string => typeof value === 'string')
      .map((text) => ({ text, score: 1 }));
  }

  private url(path: string): string {
    return `${this.options.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private assertOk(status: number, action: string): void {
    if (status < 200 || status >= 300) {
      throw new MeilisearchRequestError(
        `Meilisearch ${action} failed with status ${status}`,
      );
    }
  }
}
