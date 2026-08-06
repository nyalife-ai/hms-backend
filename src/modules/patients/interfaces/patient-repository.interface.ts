/**
 * File: patient-repository.interface.ts
 */

import type { Repository } from '../../../core/contracts';
import type { Patient } from '../domain/patient.entity';
import type {
  CreatePatientDto,
  PatientsQueryDto,
  UpdatePatientDto,
} from '../dto';

export type PatientPage = {
  items: Patient[];
  total: number;
};

export interface IPatientRepository extends Repository<Patient, string> {
  findMany(query: PatientsQueryDto): Promise<PatientPage>;
  softDelete(id: string): Promise<void>;
  createFromDto(dto: CreatePatientDto): Promise<Patient>;
  applyUpdate(id: string, dto: UpdatePatientDto): Promise<Patient | null>;
}
