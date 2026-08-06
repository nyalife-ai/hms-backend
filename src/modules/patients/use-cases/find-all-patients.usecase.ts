/**
 * File: find-all-patients.usecase.ts
 * Module: patients
 * Purpose: Paginated list of patients.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { PatientsQueryDto } from '../dto';
import { PATIENTS_REPOSITORY } from '../constants/patients.constants';
import type { IPatientRepository, PatientPage } from '../interfaces/patient-repository.interface';

@Injectable()
export class FindAllPatientsUseCase {
  public constructor(
    @Inject(PATIENTS_REPOSITORY) private readonly repository: IPatientRepository,
  ) {}

  public async execute(query: PatientsQueryDto): Promise<Result<PatientPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
