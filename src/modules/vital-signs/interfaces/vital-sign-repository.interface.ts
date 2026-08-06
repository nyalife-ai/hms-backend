/**
 * File: vital-sign-repository.interface.ts
 * Module: vital-signs
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { VitalSign } from '../domain/vital-sign.entity';
import type { VitalSignsQueryDto } from '../dto';

export type VitalSignPage = { items: VitalSign[]; total: number };

export interface IVitalSignRepository extends Repository<VitalSign, string> {
  findMany(query: VitalSignsQueryDto): Promise<VitalSignPage>;
  softDelete(id: string): Promise<void>;
}
