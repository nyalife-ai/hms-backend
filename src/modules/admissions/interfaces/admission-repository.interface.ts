/**
 * File: admission-repository.interface.ts
 * Module: admissions
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Admission } from '../domain/admission.entity';
import type { AdmissionsQueryDto } from '../dto';

export type AdmissionPage = { items: Admission[]; total: number };

export interface IAdmissionRepository extends Repository<Admission, string> {
  findMany(query: AdmissionsQueryDto): Promise<AdmissionPage>;
  softDelete(id: string): Promise<void>;
}
