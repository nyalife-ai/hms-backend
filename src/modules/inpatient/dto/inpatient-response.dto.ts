/**
 * File: inpatient-response.dto.ts
 * Module: inpatient
 * Purpose: Inpatient response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InpatientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
