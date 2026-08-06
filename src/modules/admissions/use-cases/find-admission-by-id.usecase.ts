/**
 * File: find-admission-by-id.usecase.ts
 * Module: admissions
 * Purpose: Find admission by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { ADMISSIONS_REPOSITORY } from '../constants/admissions.constants';
import type { Admission } from '../domain/admission.entity';
import type { IAdmissionRepository } from '../interfaces/admission-repository.interface';

@Injectable()
export class FindAdmissionByIdUseCase {
  public constructor(
    @Inject(ADMISSIONS_REPOSITORY) private readonly repository: IAdmissionRepository,
  ) {}

  public async execute(id: string): Promise<Result<Admission, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Admission', id));
    }
    return Result.success(entity);
  }
}
