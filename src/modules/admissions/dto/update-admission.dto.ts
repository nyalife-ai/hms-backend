/**
 * File: update-admission.dto.ts
 * Module: admissions
 * Purpose: Update admission request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateAdmissionDto } from './create-admission.dto';

export class UpdateAdmissionDto extends PartialType(CreateAdmissionDto) {}
