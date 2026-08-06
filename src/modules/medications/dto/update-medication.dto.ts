/**
 * File: update-medication.dto.ts
 * Module: medications
 * Purpose: Update medication request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateMedicationDto } from './create-medication.dto';

export class UpdateMedicationDto extends PartialType(CreateMedicationDto) {}
