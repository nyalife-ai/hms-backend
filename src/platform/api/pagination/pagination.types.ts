export interface OffsetPaginationParams {
  readonly page?: number;
  readonly limit?: number;
}

export interface CursorPaginationParams {
  readonly after?: string;
  readonly limit?: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page?: number;
  readonly limit: number;
  readonly nextCursor?: string;
}
