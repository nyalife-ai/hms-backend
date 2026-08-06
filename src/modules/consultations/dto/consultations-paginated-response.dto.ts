/**
 * File: consultations-paginated-response.dto.ts
 * Module: consultations
 * Purpose: Paginated consultations list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { ConsultationResponseDto } from './consultation-response.dto';

export class ConsultationsPaginatedResponseDto {
  @ApiProperty({ type: [ConsultationResponseDto] })
  items!: ConsultationResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
