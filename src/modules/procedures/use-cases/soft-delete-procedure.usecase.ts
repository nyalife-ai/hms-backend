/**
 * File: soft-delete-procedure.usecase.ts
 * Module: procedures
 * Purpose: Soft-delete procedure.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import type { IProcedureRepository } from '../interfaces/procedure-repository.interface';

@Injectable()
export class SoftDeleteProcedureUseCase {
  public constructor(
    @Inject(PROCEDURES_REPOSITORY) private readonly repository: IProcedureRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Procedure', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
