/**
 * File: consultation-response.dto.ts
 * Module: consultations
 * Purpose: Consultation response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConsultationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
