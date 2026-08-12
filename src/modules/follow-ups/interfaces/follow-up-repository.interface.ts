/**
 * File: follow-up-repository.interface.ts
 * Module: follow-ups
 * Purpose: Repository port (core Repository + pagination + summary).
 */

import type { Repository } from '../../../core/contracts';
import type { FollowUp } from '../domain/follow-up.entity';
import type { FollowUpsQueryDto } from '../dto';

export type FollowUpPage = { items: FollowUp[]; total: number };

export type FollowUpSummaryCounts = {
  scheduledThisMonth: number;
  completedThisMonth: number;
  dueWithin7Days: number;
  overdue: number;
};

/** When set, restrict to consultations owned by this staff profile. */
export type FollowUpListScope = {
  doctorStaffId?: string;
};

export interface IFollowUpRepository extends Repository<FollowUp, string> {
  findMany(
    query: FollowUpsQueryDto,
    scope?: FollowUpListScope,
  ): Promise<FollowUpPage>;
  findByIdScoped(
    id: string,
    scope?: FollowUpListScope,
  ): Promise<FollowUp | null>;
  softDelete(id: string): Promise<void>;
  getSummary(scope?: FollowUpListScope): Promise<FollowUpSummaryCounts>;
  findByConsultationAndDate(
    consultationId: string,
    followUpDate: Date,
  ): Promise<FollowUp | null>;
  findLatestConsultationId(patientId: string): Promise<string | null>;
}
