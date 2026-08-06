/**
 * File: wards-paginated-response.dto.ts
 * Module: wards
 * Purpose: Paginated wards list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { WardResponseDto } from './ward-response.dto';

export class WardsPaginatedResponseDto {
  @ApiProperty({ type: [WardResponseDto] })
  items!: WardResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
