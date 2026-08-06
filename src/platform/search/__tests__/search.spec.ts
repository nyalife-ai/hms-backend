import { InMemorySearchEngine } from '../adapters/in-memory.search';
import {
  PostgresFtsSearchEngine,
  type QueryExecutor,
} from '../adapters/postgres-fts.search';
import {
  ElasticsearchRequestError,
  ElasticsearchSearchEngine,
  type HttpJsonClient,
} from '../adapters/elasticsearch.search';
import {
  MeilisearchRequestError,
  MeilisearchSearchEngine,
} from '../adapters/meilisearch.search';
import {
  createSearchEngine,
  SearchService,
  UnknownSearchEngineError,
} from '../search.service';
import { SEARCH_ENGINE, SEARCH_ENGINE_OPTIONS } from '../search.tokens';
import type { SearchDocument, SearchEngine } from '../search-engine.interface';

interface Article extends SearchDocument {
  readonly title: string;
  readonly body: string;
  readonly category?: string;
}

const articles: readonly Article[] = [
  {
    id: '1',
    title: 'Fast Rockets',
    body: 'Rockets are fast machines',
    category: 'space',
  },
  {
    id: '2',
    title: 'Slow Turtles',
    body: 'Turtles are slow reptiles',
    category: 'animals',
  },
  {
    id: '3',
    title: 'Racing Rockets',
    body: 'A racing rocket goes fast',
    category: 'space',
  },
];

describe('search platform / in-memory engine', () => {
  it('indexes, searches, ranks, and paginates results', async () => {
    const engine = new InMemorySearchEngine();
    expect(engine.name).toBe('memory');
    await engine.index('articles', articles);

    const results = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
    });
    expect(results.total).toBe(2);
    expect(results.query).toBe('rocket');
    expect(results.hits[0].item.id).toBeDefined();

    const paged = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      offset: 1,
      limit: 1,
    });
    expect(paged.hits).toHaveLength(1);
  });

  it('returns no hits for an unknown index', async () => {
    const engine = new InMemorySearchEngine();
    const results = await engine.search({ index: 'missing', query: 'x' });
    expect(results.hits).toEqual([]);
    expect(results.total).toBe(0);
  });

  it('treats an empty query as a match-all with score 1', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', articles);
    const results = await engine.search<Article>({
      index: 'articles',
      query: '',
    });
    expect(results.total).toBe(articles.length);
    expect(results.hits.every((hit) => hit.score === 1)).toBe(true);
  });

  it('applies exact-match filters', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', articles);
    const results = await engine.search<Article>({
      index: 'articles',
      query: 'a',
      filters: { category: 'animals' },
    });
    expect(results.hits.map((hit) => hit.item.id)).toEqual(['2']);
  });

  it('restricts matching to specified fields', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', articles);
    const results = await engine.search<Article>({
      index: 'articles',
      query: 'reptiles',
      fields: ['body'],
    });
    expect(results.hits.map((hit) => hit.item.id)).toEqual(['2']);

    const noMatch = await engine.search<Article>({
      index: 'articles',
      query: 'reptiles',
      fields: ['title'],
    });
    expect(noMatch.hits).toEqual([]);

    const missingField = await engine.search<Article>({
      index: 'articles',
      query: 'turtles',
      fields: ['title', 'nonexistent'],
    });
    expect(missingField.hits.map((hit) => hit.item.id)).toEqual(['2']);
  });

  it('reuses the same underlying index map across repeated index() calls', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', [articles[0]]);
    await engine.index('articles', [articles[1]]);
    const results = await engine.search<Article>({
      index: 'articles',
      query: 'turtle',
    });
    expect(results.hits.map((hit) => hit.item.id)).toEqual(['2']);
  });

  it('supports fuzzy matching for short and long terms', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', articles);

    const fuzzyShort = await engine.search<Article>({
      index: 'articles',
      query: 'fst',
      fuzzy: true,
    });
    expect(fuzzyShort.total).toBeGreaterThan(0);

    const fuzzyLong = await engine.search<Article>({
      index: 'articles',
      query: 'raching',
      fuzzy: true,
    });
    expect(fuzzyLong.total).toBeGreaterThan(0);

    const notFuzzy = await engine.search<Article>({
      index: 'articles',
      query: 'raching',
      fuzzy: false,
    });
    expect(notFuzzy.total).toBe(0);
  });

  it('removes documents (found and not found) and clears indices', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', articles);
    expect(await engine.remove('missing-index', '1')).toBe(false);
    expect(await engine.remove('articles', 'nope')).toBe(false);
    expect(await engine.remove('articles', '1')).toBe(true);
    await engine.clear('articles');
    const results = await engine.search({ index: 'articles', query: 'rocket' });
    expect(results.total).toBe(0);
  });

  it('autocompletes by prefix, ignoring non-string fields and unknown indices', async () => {
    const engine = new InMemorySearchEngine();
    await engine.index('articles', [
      ...articles,
      {
        id: '4',
        title: 42 as unknown as string,
        body: 'numeric title',
        category: 'weird',
      },
    ]);
    const suggestions = await engine.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'rac',
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.text.startsWith('rac'))).toBe(true);

    const empty = await engine.autocomplete({
      index: 'missing',
      field: 'title',
      prefix: 'r',
    });
    expect(empty).toEqual([]);

    const limited = await engine.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'r',
      limit: 1,
    });
    expect(limited).toHaveLength(1);
  });
});

describe('search platform / postgres FTS engine', () => {
  const makeExecutor = (): jest.Mocked<QueryExecutor> => ({
    query: jest.fn(),
  });

  it('builds an upsert with update clauses for multi-column documents', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValue([]);
    const engine = new PostgresFtsSearchEngine(executor);
    expect(engine.name).toBe('postgres');
    await engine.index('articles', [articles[0]]);
    const [sql, params] = executor.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO "articles"/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
    expect(params).toEqual(Object.values(articles[0]));
  });

  it('builds an upsert with DO NOTHING when only an id column is present', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValue([]);
    const engine = new PostgresFtsSearchEngine(executor);
    await engine.index('articles', [{ id: 'only' }]);
    const [sql] = executor.query.mock.calls[0];
    expect(sql).toMatch(/DO NOTHING/);
  });

  it('rejects invalid SQL identifiers', async () => {
    const executor = makeExecutor();
    const engine = new PostgresFtsSearchEngine(executor);
    await expect(
      engine.index('bad; drop table', [articles[0]]),
    ).rejects.toThrow(/Invalid SQL identifier/);
  });

  it('removes rows, distinguishing found from not-found', async () => {
    const executor = makeExecutor();
    const engine = new PostgresFtsSearchEngine(executor);
    executor.query.mockResolvedValueOnce([{ id: '1' }]);
    expect(await engine.remove('articles', '1')).toBe(true);
    executor.query.mockResolvedValueOnce([]);
    expect(await engine.remove('articles', 'nope')).toBe(false);
  });

  it('clears a table', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValue([]);
    const engine = new PostgresFtsSearchEngine(executor);
    await engine.clear('articles');
    expect(executor.query).toHaveBeenCalledWith('DELETE FROM "articles"', []);
  });

  it('builds plain-text search SQL with default fields, no filters', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValueOnce([{ rank: 0.5, id: '1', title: 'x' }]);
    executor.query.mockResolvedValueOnce([{ count: 1 }]);
    const engine = new PostgresFtsSearchEngine(executor, {
      language: 'simple',
    });
    const result = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
    });
    const [searchSql, searchParams] = executor.query.mock.calls[0];
    expect(searchSql).toMatch(/plainto_tsquery/);
    expect(searchSql).toMatch(/coalesce\("document"::text/);
    expect(searchParams).toEqual(['rocket']);
    expect(result.hits[0].item).toEqual({ id: '1', title: 'x' });
    expect(result.total).toBe(1);
  });

  it('builds fuzzy search SQL with explicit fields and filters, falling back total to row count', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValueOnce([{ rank: 0.9, id: '3' }]);
    executor.query.mockResolvedValueOnce([]);
    const engine = new PostgresFtsSearchEngine(executor);
    const result = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      fields: ['title', 'body'],
      filters: { category: 'space' },
      fuzzy: true,
      offset: 5,
      limit: 10,
    });
    const [searchSql, searchParams] = executor.query.mock.calls[0];
    expect(searchSql).toMatch(/websearch_to_tsquery/);
    expect(searchSql).toMatch(/"category" = \$2/);
    expect(searchSql).toMatch(/LIMIT 10 OFFSET 5/);
    expect(searchParams).toEqual(['rocket', 'space']);
    expect(result.total).toBe(1);
  });

  it('autocompletes via ILIKE prefix matching', async () => {
    const executor = makeExecutor();
    executor.query.mockResolvedValue([{ text: 'Racing Rockets' }]);
    const engine = new PostgresFtsSearchEngine(executor);
    const suggestions = await engine.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'Rac',
    });
    expect(suggestions).toEqual([{ text: 'Racing Rockets', score: 1 }]);
    const [sql, params] = executor.query.mock.calls[0];
    expect(sql).toMatch(/ILIKE \$1/);
    expect(params).toEqual(['Rac%']);
  });
});

describe('search platform / elasticsearch engine', () => {
  const makeClient = (): jest.Mocked<HttpJsonClient> => ({
    request: jest.fn(),
  });

  it('bulk indexes documents and skips the request when there are none', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ status: 200, body: {} });
    const engine = new ElasticsearchSearchEngine(client, {
      baseUrl: 'http://es.local:9200/',
    });
    expect(engine.name).toBe('elasticsearch');
    await engine.index('articles', []);
    expect(client.request).not.toHaveBeenCalled();

    await engine.index('articles', [articles[0]]);
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://es.local:9200/_bulk',
      }),
    );
  });

  it('removes documents, treating 404 as not-found and other errors as thrown', async () => {
    const client = makeClient();
    const engine = new ElasticsearchSearchEngine(client, {
      baseUrl: 'http://es.local',
    });
    client.request.mockResolvedValueOnce({ status: 404, body: {} });
    expect(await engine.remove('articles', '1')).toBe(false);

    client.request.mockResolvedValueOnce({ status: 200, body: {} });
    expect(await engine.remove('articles', '1')).toBe(true);

    client.request.mockResolvedValueOnce({ status: 500, body: {} });
    await expect(engine.remove('articles', '1')).rejects.toThrow(
      ElasticsearchRequestError,
    );
  });

  it('clears an index via delete_by_query', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ status: 200, body: {} });
    const engine = new ElasticsearchSearchEngine(client, {
      baseUrl: 'http://es.local',
    });
    await engine.clear('articles');
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://es.local/articles/_delete_by_query',
      }),
    );
  });

  it('searches with multi_match when fields are given and query_string otherwise, honoring fuzzy and filters', async () => {
    const client = makeClient();
    const engine = new ElasticsearchSearchEngine(client, {
      baseUrl: 'http://es.local',
    });

    client.request.mockResolvedValueOnce({
      status: 200,
      body: {
        hits: {
          total: { value: 2 },
          hits: [{ _source: articles[0], _score: 1.2 }],
        },
      },
    });
    const withFields = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      fields: ['title'],
      fuzzy: true,
      filters: { category: 'space' },
    });
    expect(withFields.total).toBe(2);
    expect(withFields.hits[0].item).toEqual(articles[0]);

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: { total: { value: 1 }, hits: [] } },
    });
    await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      fields: ['title'],
    });
    const lastCall = client.request.mock.calls.at(-1)?.[0] as { body: unknown };
    expect(lastCall.body).toMatchObject({
      query: {
        bool: {
          must: [{ multi_match: { query: 'rocket', fields: ['title'] } }],
        },
      },
    });

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: { total: 5, hits: [] } },
    });
    const withoutFields = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
    });
    expect(withoutFields.total).toBe(5);

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: { total: 0, hits: [] } },
    });
    await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      fuzzy: true,
    });
    const fuzzyQueryStringCall = client.request.mock.calls.at(-1)?.[0] as {
      body: unknown;
    };
    expect(fuzzyQueryStringCall.body).toMatchObject({
      query: { bool: { must: [{ query_string: { fuzziness: 'AUTO' } }] } },
    });

    client.request.mockResolvedValueOnce({ status: 500, body: {} });
    await expect(
      engine.search<Article>({ index: 'articles', query: 'x' }),
    ).rejects.toThrow(ElasticsearchRequestError);
  });

  it('autocompletes via the completion suggester', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({
      status: 200,
      body: {
        suggest: {
          suggestion: [{ options: [{ text: 'Racing Rockets', _score: 4 }] }],
        },
      },
    });
    const engine = new ElasticsearchSearchEngine(client, {
      baseUrl: 'http://es.local',
    });
    const suggestions = await engine.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'Rac',
    });
    expect(suggestions).toEqual([{ text: 'Racing Rockets', score: 4 }]);
  });
});

describe('search platform / meilisearch engine', () => {
  const makeClient = (): jest.Mocked<HttpJsonClient> => ({
    request: jest.fn(),
  });

  it('adds documents', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ status: 202, body: {} });
    const engine = new MeilisearchSearchEngine(client, {
      baseUrl: 'http://meili.local/',
    });
    expect(engine.name).toBe('meilisearch');
    await engine.index('articles', [articles[0]]);
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://meili.local/indexes/articles/documents',
      }),
    );
  });

  it('removes documents, treating 404 as not-found and other errors as thrown', async () => {
    const client = makeClient();
    const engine = new MeilisearchSearchEngine(client, {
      baseUrl: 'http://meili.local',
    });
    client.request.mockResolvedValueOnce({ status: 404, body: {} });
    expect(await engine.remove('articles', '1')).toBe(false);
    client.request.mockResolvedValueOnce({ status: 200, body: {} });
    expect(await engine.remove('articles', '1')).toBe(true);
    client.request.mockResolvedValueOnce({ status: 500, body: {} });
    await expect(engine.remove('articles', '1')).rejects.toThrow(
      MeilisearchRequestError,
    );
  });

  it('clears an index', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ status: 200, body: {} });
    const engine = new MeilisearchSearchEngine(client, {
      baseUrl: 'http://meili.local',
    });
    await engine.clear('articles');
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: 'http://meili.local/indexes/articles/documents',
      }),
    );
  });

  it('searches with fields/filters and falls back through total fields', async () => {
    const client = makeClient();
    const engine = new MeilisearchSearchEngine(client, {
      baseUrl: 'http://meili.local',
    });

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: [articles[0]], estimatedTotalHits: 9 },
    });
    const first = await engine.search<Article>({
      index: 'articles',
      query: 'rocket',
      fields: ['title'],
      filters: { category: 'space' },
    });
    expect(first.total).toBe(9);
    expect(first.hits[0].item).toEqual(articles[0]);

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: [articles[1]], totalHits: 4 },
    });
    const second = await engine.search<Article>({
      index: 'articles',
      query: 'turtle',
    });
    expect(second.total).toBe(4);

    client.request.mockResolvedValueOnce({
      status: 200,
      body: { hits: [articles[2]] },
    });
    const third = await engine.search<Article>({
      index: 'articles',
      query: 'x',
    });
    expect(third.total).toBe(1);

    client.request.mockResolvedValueOnce({ status: 500, body: {} });
    await expect(
      engine.search<Article>({ index: 'articles', query: 'x' }),
    ).rejects.toThrow(MeilisearchRequestError);
  });

  it('autocompletes, ignoring non-string field values', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({
      status: 200,
      body: { hits: [{ title: 'Racing Rockets' }, { title: 42 }] },
    });
    const engine = new MeilisearchSearchEngine(client, {
      baseUrl: 'http://meili.local',
    });
    const suggestions = await engine.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'Rac',
    });
    expect(suggestions).toEqual([{ text: 'Racing Rockets', score: 1 }]);
  });
});

describe('search platform / search service and engine factory', () => {
  it('creates an in-memory engine by default', () => {
    const engine = createSearchEngine('memory');
    expect(engine.name).toBe('memory');
  });

  it('delegates to supplied factories for postgres/elastic/meilisearch', () => {
    const postgresEngine = {} as SearchEngine;
    const elasticEngine = {} as SearchEngine;
    const meiliEngine = {} as SearchEngine;
    expect(
      createSearchEngine('postgres', { postgres: () => postgresEngine }),
    ).toBe(postgresEngine);
    expect(
      createSearchEngine('elastic', { elastic: () => elasticEngine }),
    ).toBe(elasticEngine);
    expect(
      createSearchEngine('meilisearch', { meilisearch: () => meiliEngine }),
    ).toBe(meiliEngine);
  });

  it('throws when a required factory is missing', () => {
    expect(() => createSearchEngine('postgres')).toThrow(
      UnknownSearchEngineError,
    );
    expect(() => createSearchEngine('elastic')).toThrow(
      UnknownSearchEngineError,
    );
    expect(() => createSearchEngine('meilisearch')).toThrow(
      UnknownSearchEngineError,
    );
  });

  it('throws for an unrecognized engine kind', () => {
    expect(() =>
      createSearchEngine(
        'bogus' as unknown as Parameters<typeof createSearchEngine>[0],
      ),
    ).toThrow(UnknownSearchEngineError);
  });

  it('exposes DI tokens', () => {
    expect(typeof SEARCH_ENGINE).toBe('symbol');
    expect(typeof SEARCH_ENGINE_OPTIONS).toBe('symbol');
  });

  it('delegates every facade method to the underlying engine', async () => {
    const engine: jest.Mocked<SearchEngine> = {
      name: 'fake',
      index: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({ hits: [], total: 0, query: 'x' }),
      autocomplete: jest.fn().mockResolvedValue([]),
    };
    const service = new SearchService(engine);
    await service.index('articles', [articles[0]]);
    expect(engine.index).toHaveBeenCalledWith('articles', [articles[0]]);
    await service.remove('articles', '1');
    expect(engine.remove).toHaveBeenCalledWith('articles', '1');
    await service.clear('articles');
    expect(engine.clear).toHaveBeenCalledWith('articles');
    await service.search({ index: 'articles', query: 'x' });
    expect(engine.search).toHaveBeenCalledWith({
      index: 'articles',
      query: 'x',
    });
    await service.autocomplete({
      index: 'articles',
      field: 'title',
      prefix: 'r',
    });
    expect(engine.autocomplete).toHaveBeenCalledWith({
      index: 'articles',
      field: 'title',
      prefix: 'r',
    });
  });
});
