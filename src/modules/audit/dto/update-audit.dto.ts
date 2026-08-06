/**
 * File: update-audit.dto.ts
 * Module: audit
 * Purpose: Update audit request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateAuditDto } from './create-audit.dto';

export class UpdateAuditDto extends PartialType(CreateAuditDto) {}
