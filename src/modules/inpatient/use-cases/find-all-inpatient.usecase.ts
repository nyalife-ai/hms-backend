/**
 * File: find-all-inpatient.usecase.ts
 * Module: inpatient
 * Purpose: Paginated list of inpatient.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { InpatientQueryDto } from '../dto';
import { INPATIENT_REPOSITORY } from '../constants/inpatient.constants';
import type { IInpatientRepository, InpatientPage } from '../interfaces/inpatient-repository.interface';

@Injectable()
export class FindAllInpatientUseCase {
  public constructor(
    @Inject(INPATIENT_REPOSITORY) private readonly repository: IInpatientRepository,
  ) {}

  public async execute(query: InpatientQueryDto): Promise<Result<InpatientPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
