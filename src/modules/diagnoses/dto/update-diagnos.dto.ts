/**
 * File: update-diagnos.dto.ts
 * Module: diagnoses
 * Purpose: Update diagnos request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateDiagnosDto } from './create-diagnos.dto';

export class UpdateDiagnosDto extends PartialType(CreateDiagnosDto) {}
