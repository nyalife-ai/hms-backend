/**
 * File: staff-paginated-response.dto.ts
 * Module: staff
 * Purpose: Paginated staff list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { StaffResponseDto } from './staff-response.dto';

export class StaffPaginatedResponseDto {
  @ApiProperty({ type: [StaffResponseDto] })
  items!: StaffResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
