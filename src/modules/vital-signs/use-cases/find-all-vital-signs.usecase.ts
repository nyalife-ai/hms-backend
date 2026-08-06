/**
 * File: find-all-vital-signs.usecase.ts
 * Module: vital-signs
 * Purpose: Paginated list of vital-signs.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { VitalSignsQueryDto } from '../dto';
import { VITAL_SIGNS_REPOSITORY } from '../constants/vital-signs.constants';
import type { IVitalSignRepository, VitalSignPage } from '../interfaces/vital-sign-repository.interface';

@Injectable()
export class FindAllVitalSignsUseCase {
  public constructor(
    @Inject(VITAL_SIGNS_REPOSITORY) private readonly repository: IVitalSignRepository,
  ) {}

  public async execute(query: VitalSignsQueryDto): Promise<Result<VitalSignPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
