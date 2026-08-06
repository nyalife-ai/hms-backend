/**
 * File: pharmacy-paginated-response.dto.ts
 * Module: pharmacy
 * Purpose: Paginated pharmacy list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { PharmacyResponseDto } from './pharmacy-response.dto';

export class PharmacyPaginatedResponseDto {
  @ApiProperty({ type: [PharmacyResponseDto] })
  items!: PharmacyResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
