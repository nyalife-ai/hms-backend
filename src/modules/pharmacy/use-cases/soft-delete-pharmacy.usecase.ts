/**
 * File: soft-delete-pharmacy.usecase.ts
 * Module: pharmacy
 * Purpose: Soft-delete pharmacy.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PHARMACY_REPOSITORY } from '../constants/pharmacy.constants';
import type { IPharmacyRepository } from '../interfaces/pharmacy-repository.interface';

@Injectable()
export class SoftDeletePharmacyUseCase {
  public constructor(
    @Inject(PHARMACY_REPOSITORY) private readonly repository: IPharmacyRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Pharmacy', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
