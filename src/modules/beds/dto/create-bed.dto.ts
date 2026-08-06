/**
 * Create bed DTO — inpatient.beds (wardId + bed number).
 * `name` maps to bed_number for scaffold compatibility.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateBedDto {
  @ApiProperty({ example: 'A-01', description: 'Bed number within the ward' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;

  @ApiProperty({ description: 'Parent ward id (no rooms in db.sql)' })
  @IsUUID()
  wardId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
