/**
 * File: send-sms.dto.ts
 * Module: notifications
 * Purpose: Admin/provider smoke-test SMS — domain recipient + template only.
 *
 * Provider credentials (API key, sender ID, base URL) come from env —
 * never from this request body.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendSmsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Resolve phone from patient → user → profile',
  })
  @ValidateIf((o: SendSmsDto) => !o.userId)
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Resolve phone from user → profile',
  })
  @ValidateIf((o: SendSmsDto) => !o.patientId)
  @IsUUID()
  userId?: string;

  @ApiProperty({
    example: 'notifications.sms.test',
    description: 'Central template key (not free-form provider copy)',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  templateKey!: string;

  @ApiPropertyOptional({
    description: 'Template variables (no PII required beyond what the template needs)',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
