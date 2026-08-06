/**
 * File: patient-response.dto.ts
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  patientNumber!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  bloodGroup?: string | null;

  @ApiPropertyOptional()
  allergies?: string | null;

  @ApiPropertyOptional()
  chronicDiseases?: string | null;

  @ApiPropertyOptional()
  occupation?: string | null;

  @ApiPropertyOptional()
  maritalStatus?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
