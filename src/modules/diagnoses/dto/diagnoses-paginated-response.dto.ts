/**
 * File: diagnoses-paginated-response.dto.ts
 * Module: diagnoses
 * Purpose: Paginated diagnoses list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { DiagnosResponseDto } from './diagnos-response.dto';

export class DiagnosesPaginatedResponseDto {
  @ApiProperty({ type: [DiagnosResponseDto] })
  items!: DiagnosResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
