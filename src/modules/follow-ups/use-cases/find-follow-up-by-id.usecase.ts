/**
 * File: find-follow-up-by-id.usecase.ts
 * Module: follow-ups
 * Purpose: Find follow-up by id (optionally doctor-scoped).
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { FollowUp } from '../domain/follow-up.entity';
import type {
  IFollowUpRepository,
  FollowUpListScope,
} from '../interfaces/follow-up-repository.interface';

@Injectable()
export class FindFollowUpByIdUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(
    id: string,
    scope?: FollowUpListScope,
  ): Promise<Result<FollowUp, NotFoundException>> {
    const entity = await this.repository.findByIdScoped(id, scope);
    if (!entity) {
      return Result.failure(new NotFoundException('FollowUp', id));
    }
    return Result.success(entity);
  }
}
