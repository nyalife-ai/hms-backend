/**
 * File: laboratory-repository.interface.ts
 * Module: laboratory
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Laboratory } from '../domain/laboratory.entity';
import type { LaboratoryQueryDto } from '../dto';

export type LaboratoryPage = { items: Laboratory[]; total: number };

export interface ILaboratoryRepository extends Repository<Laboratory, string> {
  findMany(query: LaboratoryQueryDto): Promise<LaboratoryPage>;
  softDelete(id: string): Promise<void>;
}
