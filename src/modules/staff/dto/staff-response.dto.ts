/**
 * File: staff-response.dto.ts
 * Module: staff
 * Purpose: Staff response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
