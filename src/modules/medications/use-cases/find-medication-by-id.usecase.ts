/**
 * File: find-medication-by-id.usecase.ts
 * Module: medications
 * Purpose: Find medication by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { MEDICATIONS_REPOSITORY } from '../constants/medications.constants';
import type { Medication } from '../domain/medication.entity';
import type { IMedicationRepository } from '../interfaces/medication-repository.interface';

@Injectable()
export class FindMedicationByIdUseCase {
  public constructor(
    @Inject(MEDICATIONS_REPOSITORY) private readonly repository: IMedicationRepository,
  ) {}

  public async execute(id: string): Promise<Result<Medication, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Medication', id));
    }
    return Result.success(entity);
  }
}
