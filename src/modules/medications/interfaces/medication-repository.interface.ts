/**
 * File: medication-repository.interface.ts
 * Module: medications
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Medication } from '../domain/medication.entity';
import type { MedicationsQueryDto } from '../dto';

export type MedicationPage = { items: Medication[]; total: number };

export interface IMedicationRepository extends Repository<Medication, string> {
  findMany(query: MedicationsQueryDto): Promise<MedicationPage>;
  softDelete(id: string): Promise<void>;
}
