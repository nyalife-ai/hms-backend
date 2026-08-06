/**
 * File: find-all-medications.usecase.ts
 * Module: medications
 * Purpose: Paginated list of medications.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { MedicationsQueryDto } from '../dto';
import { MEDICATIONS_REPOSITORY } from '../constants/medications.constants';
import type { IMedicationRepository, MedicationPage } from '../interfaces/medication-repository.interface';

@Injectable()
export class FindAllMedicationsUseCase {
  public constructor(
    @Inject(MEDICATIONS_REPOSITORY) private readonly repository: IMedicationRepository,
  ) {}

  public async execute(query: MedicationsQueryDto): Promise<Result<MedicationPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
