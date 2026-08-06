import {
  type SearchOptions,
  type SearchProvider,
  type SearchResult,
} from './search-provider.interface';

export class InMemorySearchProvider<
  T extends Readonly<Record<string, unknown>>,
> implements SearchProvider<T> {
  public constructor(private readonly records: readonly T[]) {}

  public search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult<T>> {
    const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
    const matches = this.records.filter((record) => {
      const fields = options.fields ?? Object.keys(record);
      return fields.some((field) => {
        const raw = Object.prototype.hasOwnProperty.call(record, field)
          ? record[field]
          : undefined;
        if (raw === null || raw === undefined) return false;
        const text = serializeSearchValue(raw);
        return (
          options.caseSensitive ? text : text.toLocaleLowerCase()
        ).includes(needle);
      });
    });
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const limit = Math.max(0, Math.floor(options.limit ?? matches.length));
    return Promise.resolve({
      items: matches.slice(offset, offset + limit),
      total: matches.length,
      query,
    });
  }
}

function serializeSearchValue(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}
