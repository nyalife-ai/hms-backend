/**
 * Create insurance-policy DTO — patients.insurance_policies.
 * `name` → policy_number.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInsurancePolicyDto {
  @ApiProperty({ example: 'POL-12345', description: 'Policy number' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  providerId!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  expiryDate!: string;

  @ApiPropertyOptional({ description: 'Optional note / member label' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  groupNumber?: string;

  @ApiPropertyOptional({ example: 'PRINCIPAL' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  memberType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  principalPolicyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  copayAmount?: number;
}
