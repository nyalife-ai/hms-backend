/**
 * File: audit-response.dto.ts
 * Module: audit
 * Purpose: Audit response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
