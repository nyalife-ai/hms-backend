/**
 * File: laboratory-response.dto.ts
 * Module: laboratory
 * Purpose: Laboratory response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LaboratoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
