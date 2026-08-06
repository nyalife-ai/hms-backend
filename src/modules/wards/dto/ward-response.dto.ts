/**
 * File: ward-response.dto.ts
 * Module: wards
 * Purpose: Ward response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WardResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() wardType!: string;
  @ApiPropertyOptional() departmentId?: string;
  @ApiProperty() dailyRate!: number;
  @ApiProperty() capacity!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
