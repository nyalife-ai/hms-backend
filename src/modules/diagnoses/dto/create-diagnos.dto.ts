/**
 * Create diagnos DTO — clinical.diagnoses.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDiagnosDto {
  @ApiProperty({ description: 'Diagnosis description (required DB column)' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @ApiProperty()
  @IsUUID()
  consultationId!: string;

  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({
    description: 'Display label; defaults to icd10Code or description',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  icd10Code?: string;

  @ApiPropertyOptional({ example: 'PRIMARY' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  diagnosisType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  onsetDate?: string;
}
