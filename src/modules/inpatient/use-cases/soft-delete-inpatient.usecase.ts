/**
 * File: soft-delete-inpatient.usecase.ts
 * Module: inpatient
 * Purpose: Soft-delete inpatient.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { INPATIENT_REPOSITORY } from '../constants/inpatient.constants';
import type { IInpatientRepository } from '../interfaces/inpatient-repository.interface';

@Injectable()
export class SoftDeleteInpatientUseCase {
  public constructor(
    @Inject(INPATIENT_REPOSITORY) private readonly repository: IInpatientRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Inpatient', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
