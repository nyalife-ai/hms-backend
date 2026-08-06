/**
 * Create prescription DTO — pharmacy.prescriptions.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePrescriptionDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty({ description: 'staff_profiles.id of prescribing doctor' })
  @IsUUID()
  prescribedBy!: string;

  @ApiPropertyOptional({
    description: 'Maps to prescription_number (or notes when omitted)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: 'Maps to notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(25)
  status?: string;
}
