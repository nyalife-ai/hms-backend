/**
 * File: update-pharmacy.usecase.ts
 * Module: pharmacy
 * Purpose: Update pharmacy.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdatePharmacyDto } from '../dto';
import { PharmacyName } from '../domain/value-objects/pharmacy-name.vo';
import { PHARMACY_REPOSITORY } from '../constants/pharmacy.constants';
import { Pharmacy } from '../domain/pharmacy.entity';
import type { IPharmacyRepository } from '../interfaces/pharmacy-repository.interface';

@Injectable()
export class UpdatePharmacyUseCase {
  public constructor(
    @Inject(PHARMACY_REPOSITORY) private readonly repository: IPharmacyRepository,
  ) {}

  public async execute(id: string, dto: UpdatePharmacyDto): Promise<Result<Pharmacy, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Pharmacy', id));
    }
    try {
      const next = Pharmacy.reconstitute(
        existing.getId(),
        {
          name: dto.name ? PharmacyName.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
        },
        existing.getCreatedAt(),
        new Date(),
      );
      const saved = await this.repository.save(next);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
