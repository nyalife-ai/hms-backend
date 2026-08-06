/**
 * File: find-all-radiology.usecase.ts
 * Module: radiology
 * Purpose: Paginated list of radiology.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { RadiologyQueryDto } from '../dto';
import { RADIOLOGY_REPOSITORY } from '../constants/radiology.constants';
import type { IRadiologyRepository, RadiologyPage } from '../interfaces/radiology-repository.interface';

@Injectable()
export class FindAllRadiologyUseCase {
  public constructor(
    @Inject(RADIOLOGY_REPOSITORY) private readonly repository: IRadiologyRepository,
  ) {}

  public async execute(query: RadiologyQueryDto): Promise<Result<RadiologyPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
