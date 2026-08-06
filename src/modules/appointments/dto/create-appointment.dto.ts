/**
 * Create appointment DTO — clinical.appointments.
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

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty({ description: 'staff_profiles.id of the doctor' })
  @IsUUID()
  doctorId!: string;

  @ApiProperty({ example: '2026-08-04', description: 'ISO date YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string;

  @ApiProperty({
    example: '2026-08-04T09:00:00.000Z',
    description: 'Start datetime (time portion persisted)',
  })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiProperty({
    example: '2026-08-04T09:30:00.000Z',
    description: 'End datetime (time portion persisted)',
  })
  @IsString()
  @MinLength(1)
  endTime!: string;

  @ApiProperty({ description: 'core.users.id of creator' })
  @IsUUID()
  createdBy!: string;

  @ApiPropertyOptional({
    example: 'CONSULTATION',
    description: 'Maps to appointment_type',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name?: string;

  @ApiPropertyOptional({ description: 'Maps to reason' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
