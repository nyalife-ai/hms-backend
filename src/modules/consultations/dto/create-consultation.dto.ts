/**
 * Create consultation DTO — clinical.consultations.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateConsultationDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty({ description: 'staff_profiles.id of the doctor' })
  @IsUUID()
  doctorId!: string;

  @ApiProperty({ description: 'core.users.id of creator' })
  @IsUUID()
  createdBy!: string;

  @ApiPropertyOptional({ description: 'Maps to chief_complaint' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Maps to notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  consultationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historyPresentIllness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentPlan?: string;
}
