/**
 * File: create-inpatient.dto.ts
 * Module: inpatient
 * Purpose: Create inpatient request DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInpatientDto {
  @ApiProperty({ example: 'Sample Inpatient' })
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
