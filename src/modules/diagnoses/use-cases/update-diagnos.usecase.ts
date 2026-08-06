/**
 * File: update-diagnos.usecase.ts
 * Module: diagnoses
 * Purpose: Update diagnos.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateDiagnosDto } from '../dto';
import { DIAGNOSES_REPOSITORY } from '../constants/diagnoses.constants';
import type { Diagnos } from '../domain/diagnos.entity';
import type { IDiagnosRepository } from '../interfaces/diagnos-repository.interface';

@Injectable()
export class UpdateDiagnosUseCase {
  public constructor(
    @Inject(DIAGNOSES_REPOSITORY) private readonly repository: IDiagnosRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateDiagnosDto,
  ): Promise<Result<Diagnos, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Diagnos', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        icd10Code: dto.icd10Code,
        diagnosisType: dto.diagnosisType,
        onsetDate: dto.onsetDate,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
