import type {
  AutocompleteQuery,
  AutocompleteSuggestion,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchResults,
} from '../search-engine.interface';

/**
 * Narrow query-execution port. Concrete apps supply a real client (`pg`,
 * Prisma's `$queryRawUnsafe`, TypeORM's driver, ...); this adapter only
 * builds SQL fragments and never opens a connection itself.
 */
export interface QueryExecutor {
  query<TRow = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[],
  ): Promise<readonly TRow[]>;
}

export interface PostgresFtsOptions {
  /** `to_tsvector`/`to_tsquery` regconfig. Defaults to `'english'`. */
  readonly language?: string;
}

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function stripRank<T>(row: Record<string, unknown>): T {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key !== 'rank') {
      rest[key] = value;
    }
  }
  return rest as T;
}

/**
 * Postgres full-text-search adapter. Indexes/removes rows in a table named
 * after the search index, and builds `to_tsvector`/`ts_rank` queries for
 * search/autocomplete. Requires the caller to supply a {@link QueryExecutor}
 * — this class never opens a database connection.
 */
export class PostgresFtsSearchEngine implements SearchEngine {
  public readonly name = 'postgres';
  private readonly language: string;

  public constructor(
    private readonly executor: QueryExecutor,
    options: PostgresFtsOptions = {},
  ) {
    this.language = options.language ?? 'english';
  }

  public async index<T extends SearchDocument>(
    index: string,
    documents: readonly T[],
  ): Promise<void> {
    for (const document of documents) {
      const columns = Object.keys(document);
      const values = columns.map((column) => document[column]);
      const placeholders = columns.map((_column, i) => `$${i + 1}`);
      const updateColumns = columns.filter((column) => column !== 'id');
      const conflictAction =
        updateColumns.length > 0
          ? `UPDATE SET ${updateColumns
              .map(
                (column) =>
                  `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`,
              )
              .join(', ')}`
          : 'NOTHING';
      const sql = `INSERT INTO ${quoteIdentifier(index)} (${columns
        .map(quoteIdentifier)
        .join(
          ', ',
        )}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO ${conflictAction}`;
      await this.executor.query(sql, values);
    }
  }

  public async remove(index: string, id: string): Promise<boolean> {
    const rows = await this.executor.query<{ id: string }>(
      `DELETE FROM ${quoteIdentifier(index)} WHERE id = $1 RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }

  public async clear(index: string): Promise<void> {
    await this.executor.query(`DELETE FROM ${quoteIdentifier(index)}`, []);
  }

  public async search<T extends SearchDocument>(
    query: SearchQuery,
  ): Promise<SearchResults<T>> {
    const searchFields =
      query.fields && query.fields.length > 0 ? query.fields : ['document'];
    const vectorExpr = `to_tsvector('${this.language}', ${searchFields
      .map((field) => `coalesce(${quoteIdentifier(field)}::text, '')`)
      .join(" || ' ' || ")})`;
    const tsQueryFn = query.fuzzy ? 'websearch_to_tsquery' : 'plainto_tsquery';
    const whereClauses = [
      `${vectorExpr} @@ ${tsQueryFn}('${this.language}', $1)`,
    ];
    const params: unknown[] = [query.query];
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        params.push(value);
        whereClauses.push(`${quoteIdentifier(key)} = $${params.length}`);
      }
    }
    const whereSql = whereClauses.join(' AND ');
    const limit = Math.max(0, Math.floor(query.limit ?? 20));
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const sql = `SELECT *, ts_rank(${vectorExpr}, ${tsQueryFn}('${this.language}', $1)) AS rank FROM ${quoteIdentifier(
      query.index,
    )} WHERE ${whereSql} ORDER BY rank DESC LIMIT ${limit} OFFSET ${offset}`;
    const rows = await this.executor.query<
      Record<string, unknown> & { rank: number }
    >(sql, params);
    const countSql = `SELECT count(*)::int AS count FROM ${quoteIdentifier(
      query.index,
    )} WHERE ${whereSql}`;
    const countRows = await this.executor.query<{ count: number }>(
      countSql,
      params,
    );
    return {
      hits: rows.map((row) => ({ item: stripRank<T>(row), score: row.rank })),
      total: countRows[0]?.count ?? rows.length,
      query: query.query,
    };
  }

  public async autocomplete(
    query: AutocompleteQuery,
  ): Promise<readonly AutocompleteSuggestion[]> {
    const limit = Math.max(0, Math.floor(query.limit ?? 10));
    const column = quoteIdentifier(query.field);
    const sql = `SELECT DISTINCT ${column} AS text FROM ${quoteIdentifier(
      query.index,
    )} WHERE ${column}::text ILIKE $1 LIMIT ${limit}`;
    const rows = await this.executor.query<{ text: string }>(sql, [
      `${query.prefix}%`,
    ]);
    return rows.map((row) => ({ text: row.text, score: 1 }));
  }
}
