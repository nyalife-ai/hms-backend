import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchResults,
} from '../search-engine.interface';

/**
 * Narrow HTTP port. Platform never depends on the official Elasticsearch
 * client package — supply any client that can perform a JSON request.
 */
export interface HttpJsonClient {
  request(options: {
    method: string;
    url: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}

export interface ElasticsearchOptions {
  readonly baseUrl: string;
}

export class ElasticsearchRequestError extends Error {}

interface ElasticsearchSearchResponse<T> {
  readonly hits: {
    readonly total: { readonly value: number } | number;
    readonly hits: readonly { readonly _source: T; readonly _score: number }[];
  };
}

interface ElasticsearchSuggestResponse {
  readonly suggest: {
    readonly suggestion: readonly {
      readonly options: readonly { text: string; _score: number }[];
    }[];
  };
}

/**
 * Elasticsearch adapter driven purely through its HTTP REST API via an
 * injected {@link HttpJsonClient}. Optional in the sense that no npm client
 * package is required.
 */
export class ElasticsearchSearchEngine implements SearchEngine {
  public readonly name = 'elasticsearch';

  public constructor(
    private readonly client: HttpJsonClient,
    private readonly options: ElasticsearchOptions,
  ) {}

  public async index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    const lines = documents.flatMap((document) => [
      JSON.stringify({ index: { _index: index, _id: document.id } }),
      JSON.stringify(document),
    ]);
    const response = await this.client.request({
      method: 'POST',
      url: this.url('/_bulk'),
      body: `${lines.join('\n')}\n`,
    });
    this.assertOk(response.status, 'bulk index');
  }

  public async remove(index: string, id: string): Promise<boolean> {
    const response = await this.client.request({
      method: 'DELETE',
      url: this.url(`/${index}/_doc/${id}`),
    });
    if (response.status === 404) {
      return false;
    }
    this.assertOk(response.status, 'delete document');
    return true;
  }

  public async clear(index: string): Promise<void> {
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/${index}/_delete_by_query`),
      body: { query: { match_all: {} } },
    });
    this.assertOk(response.status, 'clear index');
  }

  public async search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>> {
    const must = query.fields
      ? {
          multi_match: {
            query: query.query,
            fields: query.fields,
            ...(query.fuzzy ? { fuzziness: 'AUTO' } : {}),
          },
        }
      : {
          query_string: {
            query: query.query,
            ...(query.fuzzy ? { fuzziness: 'AUTO' } : {}),
          },
        };
    const body: Record<string, unknown> = {
      from: query.offset ?? 0,
      size: query.limit ?? 20,
      query: {
        bool: {
          must: [must],
          filter: query.filters
            ? Object.entries(query.filters).map(([field, value]) => ({
                term: { [field]: value },
              }))
            : [],
        },
      },
    };
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/${query.index}/_search`),
      body,
    });
    this.assertOk(response.status, 'search');
    const payload = response.body as ElasticsearchSearchResponse<T>;
    const total =
      typeof payload.hits.total === 'number'
        ? payload.hits.total
        : payload.hits.total.value;
    return {
      hits: payload.hits.hits.map((hit) => ({
        item: hit._source,
        score: hit._score,
      })),
      total,
      query: query.query,
    };
  }

  public async autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]> {
    const body = {
      size: 0,
      suggest: {
        suggestion: {
          prefix: query.prefix,
          completion: {
            field: `${query.field}.suggest`,
            size: query.limit ?? 10,
          },
        },
      },
    };
    const response = await this.client.request({
      method: 'POST',
      url: this.url(`/${query.index}/_search`),
      body,
    });
    this.assertOk(response.status, 'autocomplete');
    const payload = response.body as ElasticsearchSuggestResponse;
    return payload.suggest.suggestion.flatMap((entry) =>
      entry.options.map((option) => ({
        text: option.text,
        score: option._score,
      })),
    );
  }

  private url(path: string): string {
    return `${this.options.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private assertOk(status: number, action: string): void {
    if (status < 200 || status >= 300) {
      throw new ElasticsearchRequestError(
        `Elasticsearch ${action} failed with status ${status}`,
      );
    }
  }
}
