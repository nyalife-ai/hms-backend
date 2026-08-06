import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PaymentDto {
  @ApiProperty({ enum: ['CASH', 'INSURANCE'] })
  @IsIn(['CASH', 'INSURANCE'])
  method!: 'CASH' | 'INSURANCE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyNumber?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  benefitBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ediAuthGuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benefitCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benefitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemeCode?: string;
}

export class CheckInDto {
  @ApiProperty()
  @IsString()
  patientName!: string;

  @ApiProperty()
  @IsString()
  mrn!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  age!: number;

  @ApiProperty({ enum: ['Male', 'Female'] })
  @IsIn(['Male', 'Female'])
  gender!: 'Male' | 'Female';

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsBoolean()
  firstVisit!: boolean;

  @ApiProperty({ type: PaymentDto })
  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;
}

export class VitalsDto {
  @ApiProperty() @IsString() temperature!: string;
  @ApiProperty() @IsString() systolic!: string;
  @ApiProperty() @IsString() diastolic!: string;
  @ApiProperty() @IsString() pulse!: string;
  @ApiProperty() @IsString() respRate!: string;
  @ApiProperty() @IsString() spo2!: string;
  @ApiProperty() @IsString() weightKg!: string;
}

export class TriageDto {
  @ApiProperty({ type: VitalsDto })
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals!: VitalsDto;

  @ApiProperty()
  @IsString()
  doctorName!: string;

  @ApiProperty()
  @IsString()
  nurseName!: string;
}

export class LabTestDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() unit!: string;
  @ApiProperty() @IsString() range!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() result?: string;
}

export class OrderLabsDto {
  @ApiProperty({ type: [LabTestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabTestDto)
  tests!: LabTestDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class LabResultsDto {
  @ApiProperty({ type: [LabTestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabTestDto)
  tests!: LabTestDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;
}

export class PrescriptionDto {
  @ApiProperty() @IsString() medication!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() medicationId?: string;
  @ApiProperty() @IsString() dosage!: string;
  @ApiProperty() @IsString() frequency!: string;
  @ApiProperty() @IsString() duration!: string;
}

export class CompleteConsultationDto {
  @ApiProperty()
  @IsString()
  diagnosis!: string;

  @ApiProperty({ type: [PrescriptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionDto)
  prescriptions!: PrescriptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUpDate?: string;
}

export class FinalizeBillingDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  claimId?: string;
}

export class ClaimStatusDto {
  @ApiProperty({ enum: ['SUBMITTED', 'ACCEPTED', 'REJECTED'] })
  @IsIn(['SUBMITTED', 'ACCEPTED', 'REJECTED'])
  status!: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
}
