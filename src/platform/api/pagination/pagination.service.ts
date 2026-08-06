import {
  type OffsetPaginationParams,
  type CursorPaginationParams,
  type PaginatedResult,
} from './pagination.types';

export class PaginationService {
  public constructor(
    private readonly defaultLimit = 20,
    private readonly maxLimit = 100,
  ) {
    if (defaultLimit < 1 || maxLimit < 1 || defaultLimit > maxLimit) {
      throw new RangeError('Pagination limits must be positive and consistent');
    }
  }

  public normalizeOffset(
    params: OffsetPaginationParams,
  ): Readonly<{ page: number; limit: number }> {
    return {
      page: this.positiveInteger(params.page, 1),
      limit: this.normalizeLimit(params.limit),
    };
  }

  public normalizeCursor(
    params: CursorPaginationParams,
  ): Readonly<{ after?: string; limit: number }> {
    return {
      ...(params.after === undefined ? {} : { after: params.after }),
      limit: this.normalizeLimit(params.limit),
    };
  }

  public toOffset(
    params: OffsetPaginationParams,
  ): Readonly<{ offset: number; limit: number }> {
    const normalized = this.normalizeOffset(params);
    return {
      offset: (normalized.page - 1) * normalized.limit,
      limit: normalized.limit,
    };
  }

  public encodeCursor(token: string): string {
    if (token.length === 0) throw new Error('Cursor token cannot be empty');
    return Buffer.from(token, 'utf8').toString('base64url');
  }

  public decodeCursor(cursor: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (
      decoded.length === 0 ||
      this.encodeCursor(decoded) !== cursor.replace(/=+$/, '')
    ) {
      throw new Error('Invalid cursor');
    }
    return decoded;
  }

  public buildResult<T>(
    items: readonly T[],
    options: Readonly<{
      total: number;
      limit: number;
      page?: number;
      nextCursor?: string;
    }>,
  ): PaginatedResult<T> {
    if (!Number.isInteger(options.total) || options.total < 0) {
      throw new RangeError('Total must be a non-negative integer');
    }
    return { items: [...items], ...options };
  }

  private normalizeLimit(limit?: number): number {
    return Math.min(
      this.positiveInteger(limit, this.defaultLimit),
      this.maxLimit,
    );
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    return value === undefined || !Number.isFinite(value) || value < 1
      ? fallback
      : Math.floor(value);
  }
}
