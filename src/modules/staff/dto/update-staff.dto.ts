/**
 * File: update-staff.dto.ts
 * Module: staff
 * Purpose: Update staff request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateStaffDto } from './create-staff.dto';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}
