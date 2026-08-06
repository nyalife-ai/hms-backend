/**
 * File: radiology-paginated-response.dto.ts
 * Module: radiology
 * Purpose: Paginated radiology list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { RadiologyResponseDto } from './radiology-response.dto';

export class RadiologyPaginatedResponseDto {
  @ApiProperty({ type: [RadiologyResponseDto] })
  items!: RadiologyResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
