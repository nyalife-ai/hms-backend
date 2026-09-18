/**
 * Imaging request-body DTOs for the /imaging clinical surface.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateScanTypeDto {
  @ApiProperty() @IsString() @MaxLength(50) scanType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) standardPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) typicalDurationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contrastRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() preparationInstructions?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
}

export class UpdateScanTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) scanType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) standardPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) typicalDurationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contrastRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() preparationInstructions?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReportTemplateSectionDto {
  @ApiProperty() @IsString() @MaxLength(80) key!: string;
  @ApiProperty() @IsString() @MaxLength(150) label!: string;
  @ApiProperty() @IsString() @MaxLength(30) type!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
}

export class CreateReportTemplateDto {
  @ApiProperty() @IsString() @MaxLength(150) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) modality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bodyRegion?: string;
  @ApiPropertyOptional({ type: [ReportTemplateSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateSectionDto)
  sections?: ReportTemplateSectionDto[];
}

export class UpdateReportTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) modality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bodyRegion?: string;
  @ApiPropertyOptional({ type: [ReportTemplateSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateSectionDto)
  sections?: ReportTemplateSectionDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateImagingRequestDto {
  @ApiProperty() @IsUUID() patientId!: string;
  @ApiProperty() @IsUUID() scanTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() requestingDoctorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() consultationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clinicalIndication?: string;
  @ApiPropertyOptional({ enum: ['ROUTINE', 'URGENT', 'STAT'] })
  @IsOptional()
  @IsIn(['ROUTINE', 'URGENT', 'STAT'])
  priority?: string;
}

export class ScheduleImagingRequestDto {
  @ApiProperty() @IsString() scheduledAt!: string;
}

export class CancelImagingRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class EnterFindingsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() radiologistId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() findingsText?: string;
  @ApiPropertyOptional({ enum: ['DRAFT', 'FINALIZED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'FINALIZED'])
  status?: string;
}

export class EnterReportDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() radiologistId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() findingsId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() sectionsData?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() finalImpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conclusion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendations?: string;
  @ApiPropertyOptional({ description: 'Save as FINAL rather than DRAFT' })
  @IsOptional()
  @IsBoolean()
  finalize?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() signature?: string;
}

export class AmendReportDto {
  @ApiProperty() @IsUUID() reportId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() radiologistId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() findingsId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() sectionsData?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() finalImpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conclusion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendations?: string;
  @ApiProperty({ description: 'Why this report is being amended' })
  @IsString()
  reason!: string;
}

export class AddImageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) modality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seriesDescription?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  numberOfImages?: number;
}
