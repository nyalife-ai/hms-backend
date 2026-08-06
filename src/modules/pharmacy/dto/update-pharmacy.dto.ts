/**
 * File: update-pharmacy.dto.ts
 * Module: pharmacy
 * Purpose: Update pharmacy request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreatePharmacyDto } from './create-pharmacy.dto';

export class UpdatePharmacyDto extends PartialType(CreatePharmacyDto) {}
