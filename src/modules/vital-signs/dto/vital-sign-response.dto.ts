/**
 * File: vital-sign-response.dto.ts
 * Module: vital-signs
 * Purpose: VitalSign response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VitalSignResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
