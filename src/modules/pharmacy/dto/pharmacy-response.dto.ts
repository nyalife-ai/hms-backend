/**
 * File: pharmacy-response.dto.ts
 * Module: pharmacy
 * Purpose: Pharmacy response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PharmacyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
