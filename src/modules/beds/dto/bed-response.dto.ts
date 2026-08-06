/**
 * File: bed-response.dto.ts
 * Module: beds
 * Purpose: Bed response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BedResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() wardId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
