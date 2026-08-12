/**
 * Create follow-up DTO — clinical.follow_ups.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FollowUpStatus } from '../enums/follow-up-status.enum';

export class CreateFollowUpDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiPropertyOptional({
    description:
      'Required unless the patient has at least one consultation (latest is used)',
  })
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiProperty()
  @IsDateString()
  followUpDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({
    description: 'User who created the follow-up (defaults to the authenticated user)',
  })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  followUpType?: string;

  @ApiPropertyOptional({ enum: FollowUpStatus, example: FollowUpStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
