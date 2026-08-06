/**
 * File: pharmacy-repository.interface.ts
 * Module: pharmacy
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Pharmacy } from '../domain/pharmacy.entity';
import type { PharmacyQueryDto } from '../dto';

export type PharmacyPage = { items: Pharmacy[]; total: number };

export interface IPharmacyRepository extends Repository<Pharmacy, string> {
  findMany(query: PharmacyQueryDto): Promise<PharmacyPage>;
  softDelete(id: string): Promise<void>;
}
