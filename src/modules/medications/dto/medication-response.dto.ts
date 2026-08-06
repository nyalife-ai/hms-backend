/**
 * File: medication-response.dto.ts
 * Module: medications
 * Purpose: Medication response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MedicationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
