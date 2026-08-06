/**
 * File: find-all-procedures.usecase.ts
 * Module: procedures
 * Purpose: Paginated list of procedures.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { ProceduresQueryDto } from '../dto';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import type { IProcedureRepository, ProcedurePage } from '../interfaces/procedure-repository.interface';

@Injectable()
export class FindAllProceduresUseCase {
  public constructor(
    @Inject(PROCEDURES_REPOSITORY) private readonly repository: IProcedureRepository,
  ) {}

  public async execute(query: ProceduresQueryDto): Promise<Result<ProcedurePage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
