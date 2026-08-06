/**
 * File: follow-ups-paginated-response.dto.ts
 * Module: follow-ups
 * Purpose: Paginated follow-ups list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { FollowUpResponseDto } from './follow-up-response.dto';

export class FollowUpsPaginatedResponseDto {
  @ApiProperty({ type: [FollowUpResponseDto] })
  items!: FollowUpResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
