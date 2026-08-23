/**
 * File: update-patient.dto.ts
 * Immutable: id, userId, patientNumber (MRN) — not accepted here.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const MARITAL = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

export class UpdatePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @ApiPropertyOptional({ example: '1990-05-12' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: BLOOD_GROUPS })
  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: (typeof BLOOD_GROUPS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chronicDiseases?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @ApiPropertyOptional({ enum: MARITAL })
  @IsOptional()
  @IsIn(MARITAL)
  maritalStatus?: (typeof MARITAL)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Next of kin / emergency contact name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Next of kin / emergency contact phone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;
}
