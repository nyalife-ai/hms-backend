/**
 * Cancel / check-in / reschedule request DTOs.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CancelAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CheckInAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-08-04', description: 'ISO date YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string;

  @ApiProperty({ example: '2026-08-04T09:00:00.000Z' })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiProperty({ example: '2026-08-04T09:30:00.000Z' })
  @IsString()
  @MinLength(1)
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
