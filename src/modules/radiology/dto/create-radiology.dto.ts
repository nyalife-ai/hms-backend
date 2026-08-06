/**
 * Create radiology DTO — radiology.requests.
 * `name` → request_number; `description` → clinical_indication.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRadiologyDto {
  @ApiProperty({
    example: 'RAD-2026-0001',
    description: 'Request number (unique)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  scanTypeId!: string;

  @ApiProperty({ description: 'User who requested the scan' })
  @IsUUID()
  requestedBy!: string;

  @ApiPropertyOptional({ description: 'Clinical indication' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requestingDoctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiPropertyOptional({ example: 'ROUTINE' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;

  @ApiPropertyOptional({ example: 'PENDING' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
