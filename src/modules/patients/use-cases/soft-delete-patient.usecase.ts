/**
 * File: soft-delete-patient.usecase.ts
 * Module: patients
 * Purpose: Soft-delete patient.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PATIENTS_REPOSITORY } from '../constants/patients.constants';
import type { IPatientRepository } from '../interfaces/patient-repository.interface';

@Injectable()
export class SoftDeletePatientUseCase {
  public constructor(
    @Inject(PATIENTS_REPOSITORY) private readonly repository: IPatientRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Patient', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
