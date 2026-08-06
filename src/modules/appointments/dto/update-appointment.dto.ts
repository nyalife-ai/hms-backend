/**
 * File: update-appointment.dto.ts
 * Module: appointments
 * Purpose: Update appointment request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {}
