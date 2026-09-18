/**
 * File: create-department.dto.ts
 * Module: departments
 * Purpose: Create department request DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const DEPARTMENT_TYPES = ['CLINICAL', 'ADMINISTRATIVE', 'SUPPORT'] as const;

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Sample Department' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Short unique code (auto-generated from name if omitted)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ enum: DEPARTMENT_TYPES })
  @IsOptional()
  @IsIn(DEPARTMENT_TYPES)
  type?: (typeof DEPARTMENT_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  headName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  headPosition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
