/**
 * File: beds-paginated-response.dto.ts
 * Module: beds
 * Purpose: Paginated beds list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { BedResponseDto } from './bed-response.dto';

export class BedsPaginatedResponseDto {
  @ApiProperty({ type: [BedResponseDto] })
  items!: BedResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
