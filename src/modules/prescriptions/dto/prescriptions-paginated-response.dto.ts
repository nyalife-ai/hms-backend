/**
 * File: prescriptions-paginated-response.dto.ts
 * Module: prescriptions
 * Purpose: Paginated prescriptions list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { PrescriptionResponseDto } from './prescription-response.dto';

export class PrescriptionsPaginatedResponseDto {
  @ApiProperty({ type: [PrescriptionResponseDto] })
  items!: PrescriptionResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
