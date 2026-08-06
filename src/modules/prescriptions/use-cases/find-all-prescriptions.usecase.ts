/**
 * File: find-all-prescriptions.usecase.ts
 * Module: prescriptions
 * Purpose: Paginated list of prescriptions.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { PrescriptionsQueryDto } from '../dto';
import { PRESCRIPTIONS_REPOSITORY } from '../constants/prescriptions.constants';
import type { IPrescriptionRepository, PrescriptionPage } from '../interfaces/prescription-repository.interface';

@Injectable()
export class FindAllPrescriptionsUseCase {
  public constructor(
    @Inject(PRESCRIPTIONS_REPOSITORY) private readonly repository: IPrescriptionRepository,
  ) {}

  public async execute(query: PrescriptionsQueryDto): Promise<Result<PrescriptionPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
