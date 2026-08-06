/**
 * File: create-medication.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateMedicationDto } from '../dto';
import { Medication } from '../domain/medication.entity';
import { MEDICATIONS_REPOSITORY } from '../constants/medications.constants';
import type { IMedicationRepository } from '../interfaces/medication-repository.interface';

@Injectable()
export class CreateMedicationUseCase {
  public constructor(
    @Inject(MEDICATIONS_REPOSITORY)
    private readonly repository: IMedicationRepository,
  ) {}

  public async execute(
    dto: CreateMedicationDto,
  ): Promise<Result<Medication, string>> {
    try {
      const entity = Medication.create({
        name: dto.name,
        description: dto.description,
        genericName: dto.genericName,
        form: dto.form,
        strength: dto.strength,
        unit: dto.unit,
        standardSellingPrice: dto.standardSellingPrice,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'Create failed',
      );
    }
  }
}
