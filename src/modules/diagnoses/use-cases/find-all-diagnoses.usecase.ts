/**
 * File: find-all-diagnoses.usecase.ts
 * Module: diagnoses
 * Purpose: Paginated list of diagnoses.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { DiagnosesQueryDto } from '../dto';
import { DIAGNOSES_REPOSITORY } from '../constants/diagnoses.constants';
import type { IDiagnosRepository, DiagnosPage } from '../interfaces/diagnos-repository.interface';

@Injectable()
export class FindAllDiagnosesUseCase {
  public constructor(
    @Inject(DIAGNOSES_REPOSITORY) private readonly repository: IDiagnosRepository,
  ) {}

  public async execute(query: DiagnosesQueryDto): Promise<Result<DiagnosPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
