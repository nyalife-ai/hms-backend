/**
 * File: insurance-policy-response.dto.ts
 * Module: insurance-policies
 * Purpose: InsurancePolicy response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InsurancePolicyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
