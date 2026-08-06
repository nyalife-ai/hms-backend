/**
 * File: update-consultation.dto.ts
 * Module: consultations
 * Purpose: Update consultation request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateConsultationDto } from './create-consultation.dto';

export class UpdateConsultationDto extends PartialType(CreateConsultationDto) {}
