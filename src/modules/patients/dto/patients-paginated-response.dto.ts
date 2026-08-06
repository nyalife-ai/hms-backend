/**
 * File: patients-paginated-response.dto.ts
 * Module: patients
 * Purpose: Paginated patients list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { PatientResponseDto } from './patient-response.dto';

export class PatientsPaginatedResponseDto {
  @ApiProperty({ type: [PatientResponseDto] })
  items!: PatientResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
