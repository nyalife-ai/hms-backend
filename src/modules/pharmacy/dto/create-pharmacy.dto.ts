/**
 * File: create-pharmacy.dto.ts
 * Module: pharmacy
 * Purpose: Create pharmacy request DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePharmacyDto {
  @ApiProperty({ example: 'Sample Pharmacy' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
