/**
 * File: find-all-laboratory.usecase.ts
 * Module: laboratory
 * Purpose: Paginated list of laboratory.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { LaboratoryQueryDto } from '../dto';
import { LABORATORY_REPOSITORY } from '../constants/laboratory.constants';
import type { ILaboratoryRepository, LaboratoryPage } from '../interfaces/laboratory-repository.interface';

@Injectable()
export class FindAllLaboratoryUseCase {
  public constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: ILaboratoryRepository,
  ) {}

  public async execute(query: LaboratoryQueryDto): Promise<Result<LaboratoryPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
