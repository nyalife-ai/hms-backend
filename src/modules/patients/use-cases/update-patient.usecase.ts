/**
 * File: update-patient.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdatePatientDto } from '../dto';
import { Patient } from '../domain/patient.entity';
import { PATIENTS_REPOSITORY } from '../constants/patients.constants';
import type { IPatientRepository } from '../interfaces/patient-repository.interface';

@Injectable()
export class UpdatePatientUseCase {
  public constructor(
    @Inject(PATIENTS_REPOSITORY)
    private readonly repository: IPatientRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdatePatientDto,
  ): Promise<Result<Patient, NotFoundException | string>> {
    try {
      const updated = await this.repository.applyUpdate(id, dto);
      if (!updated) {
        return Result.failure(new NotFoundException('Patient not found'));
      }
      return Result.success(updated);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'Update failed',
      );
    }
  }
}
