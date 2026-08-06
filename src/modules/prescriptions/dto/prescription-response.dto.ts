/**
 * File: prescription-response.dto.ts
 * Module: prescriptions
 * Purpose: Prescription response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
