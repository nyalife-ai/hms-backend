/**
 * File: vital-signs-paginated-response.dto.ts
 * Module: vital-signs
 * Purpose: Paginated vital-signs list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { VitalSignResponseDto } from './vital-sign-response.dto';

export class VitalSignsPaginatedResponseDto {
  @ApiProperty({ type: [VitalSignResponseDto] })
  items!: VitalSignResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
