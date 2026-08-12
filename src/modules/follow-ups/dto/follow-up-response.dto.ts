/**
 * File: follow-up-response.dto.ts
 * Module: follow-ups
 * Purpose: Rich follow-up response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FollowUpStatus } from '../enums/follow-up-status.enum';

export class FollowUpResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() patientName!: string;
  @ApiProperty() patientMrn!: string;
  @ApiProperty() consultationId!: string;
  @ApiPropertyOptional({ nullable: true }) appointmentId?: string | null;
  @ApiProperty() doctorId!: string;
  @ApiProperty() doctorName!: string;
  @ApiProperty({ type: String, format: 'date' }) followUpDate!: string;
  @ApiPropertyOptional({ nullable: true }) followUpType?: string | null;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: FollowUpStatus }) status!: FollowUpStatus | string;
  @ApiPropertyOptional({ nullable: true }) notes?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
