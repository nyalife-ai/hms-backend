/**
 * Shared offset pagination query fields.
 * List DTOs should extend this (or re-declare the same fields) so
 * ValidationPipe whitelist accepts page/limit consistently.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}

/**
 * Resolve page/limit (preferred) or legacy take/skip into DB offset params.
 * Prefer page/limit when both styles are present.
 */
export function resolveListPagination(input: {
  page?: string | number;
  limit?: string | number;
  take?: string | number;
  skip?: string | number;
  defaultLimit?: number;
  maxLimit?: number;
}): { page: number; limit: number; take: number; skip: number } {
  const defaultLimit = input.defaultLimit ?? 50;
  const maxLimit = input.maxLimit ?? 500;

  const toPositiveInt = (v: string | number | undefined, fallback: number) => {
    if (v === undefined || v === null || v === '') return fallback;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
  };

  const hasPageLimit =
    input.page !== undefined &&
    input.page !== null &&
    String(input.page) !== '';

  if (hasPageLimit || (input.limit !== undefined && String(input.limit) !== '')) {
    const page = Math.max(1, toPositiveInt(input.page, 1));
    const limit = Math.min(
      maxLimit,
      Math.max(1, toPositiveInt(input.limit, defaultLimit)),
    );
    return { page, limit, take: limit, skip: (page - 1) * limit };
  }

  const take = Math.min(
    maxLimit,
    Math.max(1, toPositiveInt(input.take, defaultLimit)),
  );
  const skip = Math.max(0, toPositiveInt(input.skip, 0));
  const page = Math.floor(skip / take) + 1;
  return { page, limit: take, take, skip };
}

/** Legacy take/skip aliases — prefer page/limit. */
export class OffsetListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Prefer limit; kept for backward compatibility',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Prefer page; kept for backward compatibility',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
