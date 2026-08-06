/**
 * File: create-patient.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreatePatientDto } from '../dto';
import { Patient } from '../domain/patient.entity';
import { PATIENTS_REPOSITORY } from '../constants/patients.constants';
import type { IPatientRepository } from '../interfaces/patient-repository.interface';

@Injectable()
export class CreatePatientUseCase {
  public constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly repository: IPatientRepository,
  ) {}

  public async execute(dto: CreatePatientDto): Promise<Result<Patient, string>> {
    try {
      const saved = await this.repository.createFromDto(dto);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'Create failed',
      );
    }
  }
}
