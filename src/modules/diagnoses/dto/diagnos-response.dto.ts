/**
 * File: diagnos-response.dto.ts
 * Module: diagnoses
 * Purpose: Diagnos response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DiagnosResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
