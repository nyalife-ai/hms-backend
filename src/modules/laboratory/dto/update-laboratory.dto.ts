/**
 * File: update-laboratory.dto.ts
 * Module: laboratory
 * Purpose: Update laboratory request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateLaboratoryDto } from './create-laboratory.dto';

export class UpdateLaboratoryDto extends PartialType(CreateLaboratoryDto) {}
