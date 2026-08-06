/**
 * File: audit-paginated-response.dto.ts
 * Module: audit
 * Purpose: Paginated audit list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { AuditResponseDto } from './audit-response.dto';

export class AuditPaginatedResponseDto {
  @ApiProperty({ type: [AuditResponseDto] })
  items!: AuditResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
