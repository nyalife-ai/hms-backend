/**
 * File: update-prescription.dto.ts
 * Module: prescriptions
 * Purpose: Update prescription request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreatePrescriptionDto } from './create-prescription.dto';

export class UpdatePrescriptionDto extends PartialType(CreatePrescriptionDto) {}
