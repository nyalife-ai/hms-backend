/**
 * File: find-all-pharmacy.usecase.ts
 * Module: pharmacy
 * Purpose: Paginated list of pharmacy.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { PharmacyQueryDto } from '../dto';
import { PHARMACY_REPOSITORY } from '../constants/pharmacy.constants';
import type { IPharmacyRepository, PharmacyPage } from '../interfaces/pharmacy-repository.interface';

@Injectable()
export class FindAllPharmacyUseCase {
  public constructor(
    @Inject(PHARMACY_REPOSITORY) private readonly repository: IPharmacyRepository,
  ) {}

  public async execute(query: PharmacyQueryDto): Promise<Result<PharmacyPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
