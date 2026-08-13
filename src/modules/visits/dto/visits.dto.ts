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

  @ApiPropertyOptional({ description: 'Chief reason for this visit (reception)' })
  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @ApiPropertyOptional({ description: 'Additional reception notes' })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}

export class VitalsDto {
  @ApiProperty({ example: '36.8' }) @IsString() temperature!: string;
  @ApiProperty({ example: '120' }) @IsString() systolic!: string;
  @ApiProperty({ example: '80' }) @IsString() diastolic!: string;
  @ApiProperty({ example: '72' }) @IsString() pulse!: string;
  @ApiProperty({ example: '16' }) @IsString() respRate!: string;
  @ApiProperty({ example: '98' }) @IsString() spo2!: string;
  @ApiProperty({ example: '70' }) @IsString() weightKg!: string;

  @ApiPropertyOptional({ description: 'Height in cm' })
  @IsOptional()
  @IsString()
  heightCm?: string;

  @ApiPropertyOptional({
    description: 'BMI — server calculates from height+weight when omitted',
  })
  @IsOptional()
  @IsString()
  bmi?: string;

  @ApiPropertyOptional({ description: 'Pain score 0–10' })
  @IsOptional()
  @IsString()
  painScore?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  painLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGlucose?: string;

  @ApiPropertyOptional({ enum: ['RANDOM', 'FASTING', 'OTHER', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['RANDOM', 'FASTING', 'OTHER', 'UNKNOWN'])
  bloodGlucoseContext?: 'RANDOM' | 'FASTING' | 'OTHER' | 'UNKNOWN';

  @ApiPropertyOptional({ description: 'Paediatric head circumference cm' })
  @IsOptional()
  @IsString()
  headCircumferenceCm?: string;

  @ApiPropertyOptional({ description: 'MUAC cm when clinically relevant' })
  @IsOptional()
  @IsString()
  muacCm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  temperatureMethod?: string;
}

export class TriageSymptomDto {
  @ApiProperty() @IsString() symptomId!: string;
  @ApiProperty() @IsString() symptom!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: ['SUDDEN', 'GRADUAL', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['SUDDEN', 'GRADUAL', 'UNKNOWN'])
  onset?: 'SUDDEN' | 'GRADUAL' | 'UNKNOWN';
  @ApiPropertyOptional() @IsOptional() @IsString() durationValue?: string;
  @ApiPropertyOptional({
    enum: ['HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'],
  })
  @IsOptional()
  @IsIn(['HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'])
  durationUnit?: 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
  @ApiPropertyOptional({ enum: ['MILD', 'MODERATE', 'SEVERE'] })
  @IsOptional()
  @IsIn(['MILD', 'MODERATE', 'SEVERE'])
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  @ApiPropertyOptional({
    enum: ['IMPROVING', 'STABLE', 'WORSENING', 'UNKNOWN'],
  })
  @IsOptional()
  @IsIn(['IMPROVING', 'STABLE', 'WORSENING', 'UNKNOWN'])
  progression?: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
  @ApiPropertyOptional() @IsOptional() @IsString() associatedSymptoms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class TriageRelevantHistoryDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() conditionsOther?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentMedications?: string;
  @ApiPropertyOptional() @IsOptional() allergiesKnown?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() allergens?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() allergyReaction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() surgicalHistory?: string;
}

export class TriageAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() generalAppearance?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mentalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobility?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() respiratoryEffort?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  redFlags?: string[];
}

export class TriageDto {
  @ApiProperty({ type: VitalsDto })
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals!: VitalsDto;

  @ApiProperty({ description: 'Assigned doctor display name' })
  @IsString()
  doctorName!: string;

  @ApiPropertyOptional({
    description: 'Assigned doctor staff profile id (preferred over name-only)',
  })
  @IsOptional()
  @IsString()
  doctorStaffId?: string;

  @ApiProperty({ description: 'Triage officer display name' })
  @IsString()
  nurseName!: string;

  @ApiProperty({
    description: 'Clinical reason for visit (authoritative after triage)',
  })
  @IsString()
  reasonForVisit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonForVisitOther?: string;

  @ApiProperty({ description: 'Short presenting / chief complaint' })
  @IsString()
  chiefComplaint!: string;

  @ApiPropertyOptional({ type: [TriageSymptomDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriageSymptomDto)
  symptoms?: TriageSymptomDto[];

  @ApiPropertyOptional({ type: TriageRelevantHistoryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TriageRelevantHistoryDto)
  relevantHistory?: TriageRelevantHistoryDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Enabled screening contexts',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextsEnabled?: string[];

  @ApiPropertyOptional({ description: 'Antenatal screening object' })
  @IsOptional()
  @IsObject()
  antenatal?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Gynaecological screening object' })
  @IsOptional()
  @IsObject()
  gynaecological?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Paediatric screening object' })
  @IsOptional()
  @IsObject()
  paediatric?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Chronic disease screening object' })
  @IsOptional()
  @IsObject()
  chronic?: Record<string, unknown>;

  @ApiPropertyOptional({ type: TriageAssessmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TriageAssessmentDto)
  assessment?: TriageAssessmentDto;

  @ApiPropertyOptional({ description: 'Clinical triage notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    enum: ['NORMAL', 'URGENT', 'EMERGENCY'],
    description: 'Triage urgency — drives doctor queue order',
  })
  @IsIn(['NORMAL', 'URGENT', 'EMERGENCY'])
  priority!: 'NORMAL' | 'URGENT' | 'EMERGENCY';

  @ApiPropertyOptional({
    description: 'Required when priority is URGENT or EMERGENCY',
  })
  @IsOptional()
  @IsString()
  priorityReason?: string;

  @ApiPropertyOptional({
    enum: ['SEND_TO_DOCTOR', 'OBSERVE', 'REFER_EMERGENCY', 'OTHER'],
  })
  @IsOptional()
  @IsIn(['SEND_TO_DOCTOR', 'OBSERVE', 'REFER_EMERGENCY', 'OTHER'])
  disposition?: 'SEND_TO_DOCTOR' | 'OBSERVE' | 'REFER_EMERGENCY' | 'OTHER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dispositionNotes?: string;
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
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
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

  @ApiPropertyOptional({
    description: 'Full clinical consultation narrative (SOAP, gyn/obs, exam)',
  })
  @IsOptional()
  @IsObject()
  clinicalRecord?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  orderedServices?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  orderedSurgeries?: Array<Record<string, unknown>>;
}

export class SaveClinicalRecordDto {
  @ApiProperty({
    description: 'Full clinical consultation narrative saved mid-consult',
  })
  @IsObject()
  clinicalRecord!: Record<string, unknown>;
}

export class SaveClinicalOrdersDto {
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  orderedServices?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  orderedSurgeries?: Array<Record<string, unknown>>;
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

export class UpdateReceptionDto {
  @ApiPropertyOptional({ description: 'Chief reason for this visit (reception)' })
  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @ApiPropertyOptional({ description: 'Additional reception notes' })
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}

export class CollectConsultFeeDto {
  @ApiProperty({ enum: ['CASH', 'MPESA'] })
  @IsIn(['CASH', 'MPESA'])
  mode!: 'CASH' | 'MPESA';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mpesaReceipt?: string;
}
