/**
 * Create staff DTO — core.staff_profiles.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ description: 'core.users.id linked to this staff profile' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'EMP-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  employeeId!: string;

  @ApiProperty({ example: '2024-01-15', description: 'ISO date YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  joinDate!: string;

  @ApiPropertyOptional({
    example: 'Dr. Amina Okello',
    description: 'Display name override; otherwise loaded from user profile',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;
}
