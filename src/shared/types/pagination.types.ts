export interface PaginationOptions {
  readonly page?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly hasNext: boolean;
  readonly nextCursor?: string;
}
