/**
 * Analytics query DTO — validated filters for all /analytics/* endpoints.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  AnalyticsCompare,
  AnalyticsGranularity,
  AnalyticsPreset,
} from '../services/period.util';

const PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'last_year',
  'custom',
] as const;

const COMPARES = [
  'none',
  'previous_period',
  'previous_month',
  'previous_year',
] as const;

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const;

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: PRESETS })
  @IsOptional()
  @IsIn([...PRESETS])
  preset?: AnalyticsPreset;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: COMPARES, default: 'previous_period' })
  @IsOptional()
  @IsIn([...COMPARES])
  compare?: AnalyticsCompare;

  @ApiPropertyOptional({ enum: GRANULARITIES })
  @IsOptional()
  @IsIn([...GRANULARITIES])
  granularity?: AnalyticsGranularity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  wardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  insurerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  patientType?: string;
}

export class AnalyticsExportDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'xlsx'] as const)
  format?: 'csv' | 'xlsx' = 'csv';
}

export const ANALYTICS_DOMAINS = [
  'overview',
  'financial',
  'appointments',
  'patients',
  'laboratory',
  'pharmacy',
  'ipd',
  'radiology',
  'billing',
  'insurance',
  'staff',
  'void-audit',
  'follow-ups',
] as const;

export type AnalyticsDomain = (typeof ANALYTICS_DOMAINS)[number];
