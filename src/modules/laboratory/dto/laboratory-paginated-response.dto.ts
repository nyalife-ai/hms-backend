/**
 * File: laboratory-paginated-response.dto.ts
 * Module: laboratory
 * Purpose: Paginated laboratory list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { LaboratoryResponseDto } from './laboratory-response.dto';

export class LaboratoryPaginatedResponseDto {
  @ApiProperty({ type: [LaboratoryResponseDto] })
  items!: LaboratoryResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
