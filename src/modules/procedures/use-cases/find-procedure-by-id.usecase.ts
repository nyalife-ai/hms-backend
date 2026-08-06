/**
 * File: find-procedure-by-id.usecase.ts
 * Module: procedures
 * Purpose: Find procedure by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import type { Procedure } from '../domain/procedure.entity';
import type { IProcedureRepository } from '../interfaces/procedure-repository.interface';

@Injectable()
export class FindProcedureByIdUseCase {
  public constructor(
    @Inject(PROCEDURES_REPOSITORY) private readonly repository: IProcedureRepository,
  ) {}

  public async execute(id: string): Promise<Result<Procedure, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Procedure', id));
    }
    return Result.success(entity);
  }
}
