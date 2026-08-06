/**
 * File: update-radiology.dto.ts
 * Module: radiology
 * Purpose: Update radiology request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateRadiologyDto } from './create-radiology.dto';

export class UpdateRadiologyDto extends PartialType(CreateRadiologyDto) {}
