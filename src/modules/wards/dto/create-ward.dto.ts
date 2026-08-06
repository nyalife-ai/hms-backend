/**
 * Create ward request DTO — inpatient.wards.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWardDto {
  @ApiProperty({ example: 'General Ward A' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    enum: [
      'GENERAL',
      'ICU',
      'NICU',
      'MATERNITY',
      'PEDIATRIC',
      'PRIVATE',
      'SEMI_PRIVATE',
    ],
  })
  @IsOptional()
  @IsString()
  wardType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Optional note (not persisted as column)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
