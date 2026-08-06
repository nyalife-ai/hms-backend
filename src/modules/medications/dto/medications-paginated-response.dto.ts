/**
 * File: medications-paginated-response.dto.ts
 * Module: medications
 * Purpose: Paginated medications list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { MedicationResponseDto } from './medication-response.dto';

export class MedicationsPaginatedResponseDto {
  @ApiProperty({ type: [MedicationResponseDto] })
  items!: MedicationResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
