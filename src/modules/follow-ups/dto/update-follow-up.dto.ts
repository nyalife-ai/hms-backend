/**
 * File: update-follow-up.dto.ts
 * Module: follow-ups
 * Purpose: Patchable follow-up fields.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FollowUpStatus } from '../enums/follow-up-status.enum';

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Maps to follow_up_type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  followUpType?: string;

  /** Alias accepted by clients that send `type`. */
  @ApiPropertyOptional({ description: 'Alias for followUpType' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;
}
