/**
 * File: soft-delete-admission.usecase.ts
 * Module: admissions
 * Purpose: Soft-delete admission.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { ADMISSIONS_REPOSITORY } from '../constants/admissions.constants';
import type { IAdmissionRepository } from '../interfaces/admission-repository.interface';

@Injectable()
export class SoftDeleteAdmissionUseCase {
  public constructor(
    @Inject(ADMISSIONS_REPOSITORY) private readonly repository: IAdmissionRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Admission', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
