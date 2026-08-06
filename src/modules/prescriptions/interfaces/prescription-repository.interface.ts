/**
 * File: prescription-repository.interface.ts
 * Module: prescriptions
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Prescription } from '../domain/prescription.entity';
import type { PrescriptionsQueryDto } from '../dto';

export type PrescriptionPage = { items: Prescription[]; total: number };

export interface IPrescriptionRepository extends Repository<Prescription, string> {
  findMany(query: PrescriptionsQueryDto): Promise<PrescriptionPage>;
  softDelete(id: string): Promise<void>;
}
