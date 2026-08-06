/**
 * File: admissions-paginated-response.dto.ts
 * Module: admissions
 * Purpose: Paginated admissions list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { AdmissionResponseDto } from './admission-response.dto';

export class AdmissionsPaginatedResponseDto {
  @ApiProperty({ type: [AdmissionResponseDto] })
  items!: AdmissionResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
