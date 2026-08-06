/**
 * File: inpatient-paginated-response.dto.ts
 * Module: inpatient
 * Purpose: Paginated inpatient list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { InpatientResponseDto } from './inpatient-response.dto';

export class InpatientPaginatedResponseDto {
  @ApiProperty({ type: [InpatientResponseDto] })
  items!: InpatientResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
