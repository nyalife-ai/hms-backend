/**
 * File: appointment-response.dto.ts
 * Module: appointments
 * Purpose: Appointment response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppointmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
