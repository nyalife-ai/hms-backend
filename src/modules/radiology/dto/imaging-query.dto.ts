/**
 * Imaging list query DTOs — page/limit preferred; take/skip accepted.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OffsetListQueryDto } from '../../../platform/api/pagination/pagination-query.dto';

export class ImagingRequestsQueryDto extends OffsetListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ImagingScanTypesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  active?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
