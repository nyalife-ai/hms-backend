/**
 * File: appointments-paginated-response.dto.ts
 * Module: appointments
 * Purpose: Paginated appointments list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { AppointmentResponseDto } from './appointment-response.dto';

export class AppointmentsPaginatedResponseDto {
  @ApiProperty({ type: [AppointmentResponseDto] })
  items!: AppointmentResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
