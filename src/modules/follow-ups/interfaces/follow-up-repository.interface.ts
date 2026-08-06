/**
 * File: follow-up-repository.interface.ts
 * Module: follow-ups
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { FollowUp } from '../domain/follow-up.entity';
import type { FollowUpsQueryDto } from '../dto';

export type FollowUpPage = { items: FollowUp[]; total: number };

export interface IFollowUpRepository extends Repository<FollowUp, string> {
  findMany(query: FollowUpsQueryDto): Promise<FollowUpPage>;
  softDelete(id: string): Promise<void>;
}
