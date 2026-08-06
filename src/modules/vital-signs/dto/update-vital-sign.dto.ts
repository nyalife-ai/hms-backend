/**
 * File: update-vital-sign.dto.ts
 * Module: vital-signs
 * Purpose: Update vital-sign request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateVitalSignDto } from './create-vital-sign.dto';

export class UpdateVitalSignDto extends PartialType(CreateVitalSignDto) {}
