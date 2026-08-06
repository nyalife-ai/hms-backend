/**
 * File: create-pharmacy.usecase.ts
 * Module: pharmacy
 * Purpose: Create pharmacy use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreatePharmacyDto } from '../dto';
import { Pharmacy } from '../domain/pharmacy.entity';
import { PHARMACY_REPOSITORY } from '../constants/pharmacy.constants';
import type { IPharmacyRepository } from '../interfaces/pharmacy-repository.interface';

@Injectable()
export class CreatePharmacyUseCase {
  public constructor(
    @Inject(PHARMACY_REPOSITORY) private readonly repository: IPharmacyRepository,
  ) {}

  public async execute(dto: CreatePharmacyDto): Promise<Result<Pharmacy, string>> {
    try {
      const entity = Pharmacy.create({ name: dto.name, description: dto.description });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
