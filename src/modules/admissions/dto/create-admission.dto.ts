/**
 * File: create-admission.dto.ts
 * Module: admissions
 * Purpose: Create admission request DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdmissionDto {
  @ApiProperty({ example: 'Sample Admission' })
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
