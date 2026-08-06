/**
 * File: update-insurance-policy.dto.ts
 * Module: insurance-policies
 * Purpose: Update insurance-policy request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateInsurancePolicyDto } from './create-insurance-policy.dto';

export class UpdateInsurancePolicyDto extends PartialType(CreateInsurancePolicyDto) {}
