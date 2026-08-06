/**
 * File: update-bed.dto.ts
 * Module: beds
 * Purpose: Update bed request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateBedDto } from './create-bed.dto';

export class UpdateBedDto extends PartialType(CreateBedDto) {}
