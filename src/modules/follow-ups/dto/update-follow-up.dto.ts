/**
 * File: update-follow-up.dto.ts
 * Module: follow-ups
 * Purpose: Update follow-up request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateFollowUpDto } from './create-follow-up.dto';

export class UpdateFollowUpDto extends PartialType(CreateFollowUpDto) {}
