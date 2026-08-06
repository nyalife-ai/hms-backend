/**
 * File: find-all-follow-ups.usecase.ts
 * Module: follow-ups
 * Purpose: Paginated list of follow-ups.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { FollowUpsQueryDto } from '../dto';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { IFollowUpRepository, FollowUpPage } from '../interfaces/follow-up-repository.interface';

@Injectable()
export class FindAllFollowUpsUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(query: FollowUpsQueryDto): Promise<Result<FollowUpPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
