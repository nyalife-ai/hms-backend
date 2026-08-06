/**
 * File: procedures-paginated-response.dto.ts
 * Module: procedures
 * Purpose: Paginated procedures list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { ProcedureResponseDto } from './procedure-response.dto';

export class ProceduresPaginatedResponseDto {
  @ApiProperty({ type: [ProcedureResponseDto] })
  items!: ProcedureResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
