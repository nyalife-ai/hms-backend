/**
 * Create procedure DTO — clinical.procedures.
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

export class CreateProcedureDto {
  @ApiProperty({ description: 'Procedure description (required DB column)' })
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
    description: 'Display label; defaults to cptCode or description',
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
  cptCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  performerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  performedAt?: string;
}
