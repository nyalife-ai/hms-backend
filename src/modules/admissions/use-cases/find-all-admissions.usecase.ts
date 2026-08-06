/**
 * File: find-all-admissions.usecase.ts
 * Module: admissions
 * Purpose: Paginated list of admissions.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { AdmissionsQueryDto } from '../dto';
import { ADMISSIONS_REPOSITORY } from '../constants/admissions.constants';
import type { IAdmissionRepository, AdmissionPage } from '../interfaces/admission-repository.interface';

@Injectable()
export class FindAllAdmissionsUseCase {
  public constructor(
    @Inject(ADMISSIONS_REPOSITORY) private readonly repository: IAdmissionRepository,
  ) {}

  public async execute(query: AdmissionsQueryDto): Promise<Result<AdmissionPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
