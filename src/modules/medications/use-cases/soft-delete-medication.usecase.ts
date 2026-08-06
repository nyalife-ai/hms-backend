/**
 * File: soft-delete-medication.usecase.ts
 * Module: medications
 * Purpose: Soft-delete medication.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { MEDICATIONS_REPOSITORY } from '../constants/medications.constants';
import type { IMedicationRepository } from '../interfaces/medication-repository.interface';

@Injectable()
export class SoftDeleteMedicationUseCase {
  public constructor(
    @Inject(MEDICATIONS_REPOSITORY) private readonly repository: IMedicationRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Medication', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
