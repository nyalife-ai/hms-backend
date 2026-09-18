/**
 * File: department-response.dto.ts
 * Module: departments
 * Purpose: Department response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepartmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() code?: string;
  @ApiPropertyOptional() type?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() headName?: string;
  @ApiPropertyOptional() headPosition?: string;
  @ApiPropertyOptional() isActive?: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
