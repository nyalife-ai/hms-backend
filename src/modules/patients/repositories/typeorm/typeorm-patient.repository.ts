/**
 * TypeORM adapter stub — HMS uses Prisma (ORM_PROVIDER=prisma).
 * Kept for dual-ORM scaffold compatibility; not registered in PatientsModule.
 */

import { Injectable } from '@nestjs/common';
import type {
  CreatePatientDto,
  PatientsQueryDto,
  UpdatePatientDto,
} from '../../dto';
import { Patient } from '../../domain/patient.entity';
import type {
  IPatientRepository,
  PatientPage,
} from '../../interfaces/patient-repository.interface';

@Injectable()
export class TypeOrmPatientRepository implements IPatientRepository {
  public async save(_entity: Patient): Promise<Patient> {
    throw new Error('TypeORM patient repository not used — set ORM_PROVIDER=prisma');
  }
  public async delete(_id: string): Promise<void> {
    throw new Error('TypeORM patient repository not used');
  }
  public async findById(_id: string): Promise<Patient | null> {
    return null;
  }
  public async findAll(): Promise<Patient[]> {
    return [];
  }
  public async exists(_id: string): Promise<boolean> {
    return false;
  }
  public async findMany(_query: PatientsQueryDto): Promise<PatientPage> {
    return { items: [], total: 0 };
  }
  public async softDelete(_id: string): Promise<void> {
    throw new Error('TypeORM patient repository not used');
  }
  public async createFromDto(_dto: CreatePatientDto): Promise<Patient> {
    throw new Error('TypeORM patient repository not used');
  }
  public async applyUpdate(
    _id: string,
    _dto: UpdatePatientDto,
  ): Promise<Patient | null> {
    return null;
  }
}
