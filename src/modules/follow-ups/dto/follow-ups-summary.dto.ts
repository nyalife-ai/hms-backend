/**
 * File: follow-ups-summary.dto.ts
 * Module: follow-ups
 * Purpose: KPI summary for follow-ups board.
 */

import { ApiProperty } from '@nestjs/swagger';

export class FollowUpsSummaryDto {
  @ApiProperty({ description: 'SCHEDULED with follow_up_date in current month' })
  scheduledThisMonth!: number;

  @ApiProperty({ description: 'COMPLETED with follow_up_date in current month' })
  completedThisMonth!: number;

  @ApiProperty({ description: 'SCHEDULED due today through +7 days' })
  dueWithin7Days!: number;

  @ApiProperty({ description: 'SCHEDULED with follow_up_date before today' })
  overdue!: number;
}
