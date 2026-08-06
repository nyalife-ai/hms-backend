/**
 * File: find-diagnos-by-id.usecase.ts
 * Module: diagnoses
 * Purpose: Find diagnos by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DIAGNOSES_REPOSITORY } from '../constants/diagnoses.constants';
import type { Diagnos } from '../domain/diagnos.entity';
import type { IDiagnosRepository } from '../interfaces/diagnos-repository.interface';

@Injectable()
export class FindDiagnosByIdUseCase {
  public constructor(
    @Inject(DIAGNOSES_REPOSITORY) private readonly repository: IDiagnosRepository,
  ) {}

  public async execute(id: string): Promise<Result<Diagnos, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Diagnos', id));
    }
    return Result.success(entity);
  }
}
