/**
 * File: update-medication.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateMedicationDto } from '../dto';
import { MEDICATIONS_REPOSITORY } from '../constants/medications.constants';
import type { Medication } from '../domain/medication.entity';
import type { IMedicationRepository } from '../interfaces/medication-repository.interface';

@Injectable()
export class UpdateMedicationUseCase {
  public constructor(
    @Inject(MEDICATIONS_REPOSITORY)
    private readonly repository: IMedicationRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateMedicationDto,
  ): Promise<Result<Medication, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Medication', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
