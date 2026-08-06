/**
 * File: create-diagnos.usecase.ts
 * Module: diagnoses
 * Purpose: Create diagnos use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateDiagnosDto } from '../dto';
import { Diagnos } from '../domain/diagnos.entity';
import { DIAGNOSES_REPOSITORY } from '../constants/diagnoses.constants';
import type { IDiagnosRepository } from '../interfaces/diagnos-repository.interface';

@Injectable()
export class CreateDiagnosUseCase {
  public constructor(
    @Inject(DIAGNOSES_REPOSITORY) private readonly repository: IDiagnosRepository,
  ) {}

  public async execute(dto: CreateDiagnosDto): Promise<Result<Diagnos, string>> {
    try {
      const entity = Diagnos.create({
        name: dto.name,
        description: dto.description,
        consultationId: dto.consultationId,
        patientId: dto.patientId,
        icd10Code: dto.icd10Code,
        diagnosisType: dto.diagnosisType,
        onsetDate: dto.onsetDate,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
