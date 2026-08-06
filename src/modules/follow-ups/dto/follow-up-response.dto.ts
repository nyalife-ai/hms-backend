/**
 * File: follow-up-response.dto.ts
 * Module: follow-ups
 * Purpose: FollowUp response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FollowUpResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
