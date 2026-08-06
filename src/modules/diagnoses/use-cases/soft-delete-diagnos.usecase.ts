/**
 * File: soft-delete-diagnos.usecase.ts
 * Module: diagnoses
 * Purpose: Soft-delete diagnos.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DIAGNOSES_REPOSITORY } from '../constants/diagnoses.constants';
import type { IDiagnosRepository } from '../interfaces/diagnos-repository.interface';

@Injectable()
export class SoftDeleteDiagnosUseCase {
  public constructor(
    @Inject(DIAGNOSES_REPOSITORY) private readonly repository: IDiagnosRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Diagnos', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
