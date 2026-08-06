/**
 * File: find-all-beds.usecase.ts
 * Module: beds
 * Purpose: Paginated list of beds.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { BedsQueryDto } from '../dto';
import { BEDS_REPOSITORY } from '../constants/beds.constants';
import type { IBedRepository, BedPage } from '../interfaces/bed-repository.interface';

@Injectable()
export class FindAllBedsUseCase {
  public constructor(
    @Inject(BEDS_REPOSITORY) private readonly repository: IBedRepository,
  ) {}

  public async execute(query: BedsQueryDto): Promise<Result<BedPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
