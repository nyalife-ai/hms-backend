/**
 * File: follow-up-status.enum.ts
 * Module: follow-ups
 * Purpose: Aligns with clinical.follow_ups CHECK constraint.
 */

export enum FollowUpStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export const FOLLOW_UP_STATUSES = Object.values(FollowUpStatus);
