/**
 * File: find-all-wards.usecase.ts
 * Module: wards
 * Purpose: Paginated list of wards.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { WardsQueryDto } from '../dto';
import { WARDS_REPOSITORY } from '../constants/wards.constants';
import type { IWardRepository, WardPage } from '../interfaces/ward-repository.interface';

@Injectable()
export class FindAllWardsUseCase {
  public constructor(
    @Inject(WARDS_REPOSITORY) private readonly repository: IWardRepository,
  ) {}

  public async execute(query: WardsQueryDto): Promise<Result<WardPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
