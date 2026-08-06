/**
 * File: find-pharmacy-by-id.usecase.ts
 * Module: pharmacy
 * Purpose: Find pharmacy by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PHARMACY_REPOSITORY } from '../constants/pharmacy.constants';
import type { Pharmacy } from '../domain/pharmacy.entity';
import type { IPharmacyRepository } from '../interfaces/pharmacy-repository.interface';

@Injectable()
export class FindPharmacyByIdUseCase {
  public constructor(
    @Inject(PHARMACY_REPOSITORY) private readonly repository: IPharmacyRepository,
  ) {}

  public async execute(id: string): Promise<Result<Pharmacy, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Pharmacy', id));
    }
    return Result.success(entity);
  }
}
