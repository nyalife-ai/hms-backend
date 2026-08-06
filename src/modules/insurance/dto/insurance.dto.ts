import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class EligibilityDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  memberNumber!: string;
}

export class OtpSendDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  sessionId!: string;
}

export class OtpVerifyDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ description: 'OTP from patient phone (or Slade sandbox response)' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ description: 'Slade benefit_code to start the visit against' })
  @IsOptional()
  @IsString()
  benefitCode?: string;

  @ApiPropertyOptional({ description: 'Slade benefit_type (e.g. OUTPATIENT)' })
  @IsOptional()
  @IsString()
  benefitType?: string;
}

export class ClaimItemDto {
  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class ClaimBodyDto {
  @ApiProperty()
  @IsString()
  memberNumber!: string;

  @ApiProperty()
  @IsString()
  patientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @ApiPropertyOptional({ description: 'Slade auth_token from start_visit' })
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiPropertyOptional({ description: 'Slade edi_auth_guid from start_visit' })
  @IsOptional()
  @IsString()
  ediAuthGuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  schemeCode?: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benefitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visitNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visitStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visitEnd?: string;

  @ApiProperty({ type: [ClaimItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimItemDto)
  items!: ClaimItemDto[];

  @ApiProperty()
  @IsNumber()
  @Min(0)
  total!: number;
}

export class SubmitClaimDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty({ type: ClaimBodyDto })
  @ValidateNested()
  @Type(() => ClaimBodyDto)
  claim!: ClaimBodyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mrn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visitId?: string;
}

export class ClaimStatusQueryDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  claimId!: string;
}

export class SyncVisitClaimDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty({ description: 'HMS visit id awaiting claim adjudication' })
  @IsString()
  visitId!: string;
}
