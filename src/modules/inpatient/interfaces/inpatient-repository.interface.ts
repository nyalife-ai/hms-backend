/**
 * File: inpatient-repository.interface.ts
 * Module: inpatient
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Inpatient } from '../domain/inpatient.entity';
import type { InpatientQueryDto } from '../dto';

export type InpatientPage = { items: Inpatient[]; total: number };

export interface IInpatientRepository extends Repository<Inpatient, string> {
  findMany(query: InpatientQueryDto): Promise<InpatientPage>;
  softDelete(id: string): Promise<void>;
}
