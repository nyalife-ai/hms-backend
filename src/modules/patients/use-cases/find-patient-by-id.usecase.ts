/**
 * File: find-patient-by-id.usecase.ts
 * Module: patients
 * Purpose: Find patient by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PATIENTS_REPOSITORY } from '../constants/patients.constants';
import type { Patient } from '../domain/patient.entity';
import type { IPatientRepository } from '../interfaces/patient-repository.interface';

@Injectable()
export class FindPatientByIdUseCase {
  public constructor(
    @Inject(PATIENTS_REPOSITORY) private readonly repository: IPatientRepository,
  ) {}

  public async execute(id: string): Promise<Result<Patient, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Patient', id));
    }
    return Result.success(entity);
  }
}
