/**
 * File: departments-paginated-response.dto.ts
 * Module: departments
 * Purpose: Paginated departments list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { DepartmentResponseDto } from './department-response.dto';

export class DepartmentsPaginatedResponseDto {
  @ApiProperty({ type: [DepartmentResponseDto] })
  items!: DepartmentResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
