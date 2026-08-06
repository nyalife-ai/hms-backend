/**
 * File: procedure-response.dto.ts
 * Module: procedures
 * Purpose: Procedure response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcedureResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
