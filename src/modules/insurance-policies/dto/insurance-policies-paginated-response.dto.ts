/**
 * File: insurance-policies-paginated-response.dto.ts
 * Module: insurance-policies
 * Purpose: Paginated insurance-policies list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { InsurancePolicyResponseDto } from './insurance-policy-response.dto';

export class InsurancePoliciesPaginatedResponseDto {
  @ApiProperty({ type: [InsurancePolicyResponseDto] })
  items!: InsurancePolicyResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
