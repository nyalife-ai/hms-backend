/**
 * File: create-audit.dto.ts
 * Module: audit
 * Purpose: Create audit request DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAuditDto {
  @ApiProperty({ example: 'CREATE' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** When set with entityType + entityId, appends to audit_logs */
  @ApiPropertyOptional({ example: 'CREATE', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  action?: string;

  @ApiPropertyOptional({ example: 'Patient' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
